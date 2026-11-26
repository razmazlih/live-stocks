export type McpClientConfiguration = { mcpClientId: string; additionalMcpClientId?: string };

export function isMcpClientId(config: McpClientConfiguration, clientId: unknown): clientId is string {
  return typeof clientId === 'string' && (clientId === config.mcpClientId || clientId === config.additionalMcpClientId);
}
