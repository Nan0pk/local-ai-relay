export interface HermesConfigCommand {
  path: string;
  value: string;
}

export function hermesConfigCommands(baseUrl: string): HermesConfigCommand[] {
  return [
    { path: 'model.provider', value: 'custom' },
    { path: 'model.default', value: 'browser-chatgpt-free' },
    { path: 'model.base_url', value: baseUrl },
    { path: 'model.api_mode', value: 'chat_completions' },
  ];
}
