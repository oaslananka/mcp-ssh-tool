# MCP-SSH-Tool Examples

This directory contains example use cases for the SSH MCP server.

## Basic Connection

### Connect with Password

```
"Connect to 192.168.1.100 as admin with password 'mypassword'"
```

### Connect with SSH Key

```
"Connect to server.example.com as deploy using SSH key"
```

### Connect Using SSH Config Alias

```
"Resolve host alias 'production' from SSH config, then connect"
```

## Remote Command Execution

### Basic Commands

```
"Run 'uname -a' on the server"
"Execute 'df -h' to check disk usage"
"Check memory usage with 'free -m'"
```

### Commands with Working Directory

```
"Run 'ls -la' in /var/www directory"
"Execute 'git status' in /home/deploy/app"
```

### Commands with Timeout

```
"Run 'find / -name *.log' with 30 second timeout"
```

## File Operations

### Reading Files

```
"Read /etc/nginx/nginx.conf"
"Show contents of /var/log/syslog"
```

### Writing Files

```
"Create file /tmp/test.txt with content 'Hello World'"
"Write configuration to /etc/myapp/config.ini"
```

### Directory Operations

```
"List files in /var/www"
"Create directory /opt/myapp/logs"
"Remove /tmp/old-files recursively"
```

## System Administration

### Package Management

```
"Install nginx package"
"Ensure htop is installed"
```

### Service Management

```
"Start nginx service"
"Restart postgresql service"
"Enable docker service on boot"
```

### Configuration Management

```
"Add line 'MaxAuthTries 3' to /etc/ssh/sshd_config"
"Ensure these hosts are in /etc/hosts:
192.168.1.10 db-server
192.168.1.20 cache-server"
```

## Session Management

### List Sessions

```
"Show all active SSH sessions"
```

### Check Session Health

```
"Ping session ssh-123456789 to check if it's still connected"
```

### Close Session

```
"Close SSH session ssh-123456789"
```

## OS Detection

```
"Detect operating system on the connected server"
```

This will return:

- Distribution name and version
- CPU architecture
- Default shell
- Package manager (apt, yum, dnf, pacman, apk)
- Init system (systemd, service)

## Complex Workflows

### Deploy Application

```
1. "Connect to production-server as deploy"
2. "Run 'cd /var/www/app && git pull origin main'"
3. "Run 'npm install --production' in /var/www/app"
4. "Restart pm2-app service"
```

### Server Health Check

```
1. "Connect to monitoring-target as admin"
2. "Run 'uptime'"
3. "Run 'df -h'"
4. "Run 'free -m'"
5. "Run 'systemctl status nginx'"
```

### Log Analysis

```
1. "Connect to log-server as analyst"
2. "Run 'tail -n 100 /var/log/nginx/access.log'"
3. "Run 'grep ERROR /var/log/app/error.log | tail -n 50'"
```
