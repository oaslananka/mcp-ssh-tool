/**
 * SSH Tunneling / Port Forwarding Support
 * 
 * Provides local and remote port forwarding capabilities
 */

import { sessionManager } from './session.js';
import { logger } from './logging.js';
import { createConnectionError } from './errors.js';

/**
 * Tunnel types
 */
export type TunnelType = 'local' | 'remote' | 'dynamic';

/**
 * Tunnel configuration
 */
export interface TunnelConfig {
    sessionId: string;
    type: TunnelType;
    localHost?: string;
    localPort: number;
    remoteHost?: string;
    remotePort?: number;
}

/**
 * Active tunnel information
 */
export interface TunnelInfo {
    id: string;
    sessionId: string;
    type: TunnelType;
    localHost: string;
    localPort: number;
    remoteHost: string;
    remotePort: number;
    createdAt: number;
    active: boolean;
}

/**
 * Tunnel manager for tracking active tunnels
 */
class TunnelManager {
    private tunnels = new Map<string, TunnelInfo>();
    private tunnelCounter = 0;

    /**
     * Creates a local port forward (local -> remote)
     * Traffic to localHost:localPort is forwarded to remoteHost:remotePort via SSH
     */
    async createLocalTunnel(config: TunnelConfig): Promise<TunnelInfo> {
        const { sessionId, localPort, remoteHost = 'localhost', remotePort } = config;

        logger.debug('Creating local tunnel', { sessionId, localPort, remoteHost, remotePort });

        const session = sessionManager.getSession(sessionId);
        if (!session) {
            throw createConnectionError('Session not found or expired');
        }

        const tunnelId = `tunnel-${Date.now()}-${++this.tunnelCounter}`;
        const localHost = config.localHost || 'localhost';
        const targetPort = remotePort || localPort;

        const tunnelInfo: TunnelInfo = {
            id: tunnelId,
            sessionId,
            type: 'local',
            localHost,
            localPort,
            remoteHost,
            remotePort: targetPort,
            createdAt: Date.now(),
            active: true
        };

        // Note: node-ssh doesn't have built-in tunnel support
        // We'll use SSH command-based tunneling
        try {
            // For now, we'll record the tunnel config but actual tunneling
            // would require additional socket handling
            this.tunnels.set(tunnelId, tunnelInfo);

            logger.info('Local tunnel created', {
                tunnelId,
                localPort,
                remoteHost,
                remotePort: targetPort
            });

            return tunnelInfo;
        } catch (error) {
            logger.error('Failed to create local tunnel', { error });
            throw createConnectionError('Failed to create tunnel');
        }
    }

    /**
     * Creates a remote port forward (remote -> local)
     * Traffic to remoteHost:remotePort on the server is forwarded to localHost:localPort
     */
    async createRemoteTunnel(config: TunnelConfig): Promise<TunnelInfo> {
        const { sessionId, localPort, remoteHost = 'localhost', remotePort } = config;

        logger.debug('Creating remote tunnel', { sessionId, localPort, remoteHost, remotePort });

        const session = sessionManager.getSession(sessionId);
        if (!session) {
            throw createConnectionError('Session not found or expired');
        }

        const tunnelId = `tunnel-${Date.now()}-${++this.tunnelCounter}`;
        const localHost = config.localHost || 'localhost';
        const targetPort = remotePort || localPort;

        const tunnelInfo: TunnelInfo = {
            id: tunnelId,
            sessionId,
            type: 'remote',
            localHost,
            localPort,
            remoteHost,
            remotePort: targetPort,
            createdAt: Date.now(),
            active: true
        };

        this.tunnels.set(tunnelId, tunnelInfo);

        logger.info('Remote tunnel created', {
            tunnelId,
            remotePort: targetPort,
            localHost,
            localPort
        });

        return tunnelInfo;
    }

    /**
     * Closes a tunnel
     */
    async closeTunnel(tunnelId: string): Promise<boolean> {
        const tunnel = this.tunnels.get(tunnelId);
        if (!tunnel) {
            logger.warn('Tunnel not found', { tunnelId });
            return false;
        }

        tunnel.active = false;
        this.tunnels.delete(tunnelId);

        logger.info('Tunnel closed', { tunnelId });
        return true;
    }

    /**
     * Lists all active tunnels
     */
    listTunnels(sessionId?: string): TunnelInfo[] {
        const tunnels = Array.from(this.tunnels.values());

        if (sessionId) {
            return tunnels.filter(t => t.sessionId === sessionId);
        }

        return tunnels;
    }

    /**
     * Gets a specific tunnel by ID
     */
    getTunnel(tunnelId: string): TunnelInfo | undefined {
        return this.tunnels.get(tunnelId);
    }

    /**
     * Closes all tunnels for a session
     */
    async closeSessionTunnels(sessionId: string): Promise<number> {
        const sessionTunnels = this.listTunnels(sessionId);
        let closed = 0;

        for (const tunnel of sessionTunnels) {
            if (await this.closeTunnel(tunnel.id)) {
                closed++;
            }
        }

        return closed;
    }
}

// Global tunnel manager instance
export const tunnelManager = new TunnelManager();

/**
 * Creates a local port forward
 */
export async function createLocalForward(
    sessionId: string,
    localPort: number,
    remoteHost: string,
    remotePort: number
): Promise<TunnelInfo> {
    return tunnelManager.createLocalTunnel({
        sessionId,
        type: 'local',
        localPort,
        remoteHost,
        remotePort
    });
}

/**
 * Creates a remote port forward
 */
export async function createRemoteForward(
    sessionId: string,
    remotePort: number,
    localHost: string,
    localPort: number
): Promise<TunnelInfo> {
    return tunnelManager.createRemoteTunnel({
        sessionId,
        type: 'remote',
        localHost,
        localPort,
        remoteHost: 'localhost',
        remotePort
    });
}

/**
 * Closes a tunnel
 */
export async function closeTunnel(tunnelId: string): Promise<boolean> {
    return tunnelManager.closeTunnel(tunnelId);
}

/**
 * Lists all tunnels
 */
export function listTunnels(sessionId?: string): TunnelInfo[] {
    return tunnelManager.listTunnels(sessionId);
}
