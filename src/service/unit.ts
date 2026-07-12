function quoteSystemd(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function escapeSystemdPath(value: string): string {
  return value
    .replaceAll('\\', '\\x5c')
    .replaceAll(' ', '\\x20')
    .replaceAll('\t', '\\x09')
    .replaceAll('%', '%%');
}

export function buildServiceUnit(root: string, nodePath: string, envPath: string): string {
  return `[Unit]\nDescription=Local AI Relay\nAfter=graphical-session.target network-online.target\n\n` +
    `[Service]\nType=simple\nWorkingDirectory=${escapeSystemdPath(root)}\n` +
    `EnvironmentFile=-${escapeSystemdPath(envPath)}\n` +
    `ExecStart=${quoteSystemd(nodePath)} ${quoteSystemd(`${root}/dist/index.js`)}\n` +
    `Restart=on-failure\nRestartSec=3\nPassEnvironment=DISPLAY WAYLAND_DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS\n\n` +
    `[Install]\nWantedBy=default.target\n`;
}
