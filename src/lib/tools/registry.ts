import { TOOL_DEFINITIONS, ToolDefinition } from './definitions'

export interface ToolCall {
  id: string
  name: string
  parameters: Record<string, any>
}

export interface ToolResult {
  toolCallId: string
  result: any
  error?: string
  success: boolean
}

export type ToolFunction = (parameters: Record<string, any>, userId: string) => Promise<any>

class ToolRegistry {
  private tools: Map<string, ToolFunction> = new Map()
  private definitions: Map<string, ToolDefinition> = new Map()

  constructor() {
    TOOL_DEFINITIONS.forEach(def => {
      this.definitions.set(def.name, def)
    })
  }

  registerTool(name: string, func: ToolFunction) {
    if (!this.definitions.has(name)) {
      throw new Error(`Tool ${name} is not defined in TOOL_DEFINITIONS`)
    }
    this.tools.set(name, func)
  }

  async executeTool(toolCall: ToolCall, userId: string): Promise<ToolResult> {
    const { id, name, parameters } = toolCall
    
    try {
      const toolFunction = this.tools.get(name)
      if (!toolFunction) {
        throw new Error(`Tool ${name} is not registered`)
      }

      this.validateParameters(name, parameters)
      const result = await toolFunction(parameters, userId)
      
      return {
        toolCallId: id,
        result,
        success: true
      }
    } catch (error) {
      return {
        toolCallId: id,
        result: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false
      }
    }
  }

  private validateParameters(toolName: string, parameters: Record<string, any>) {
    const definition = this.definitions.get(toolName)
    if (!definition) {
      throw new Error(`Tool definition not found: ${toolName}`)
    }

    const { required, properties } = definition.parameters
    
    for (const requiredParam of required) {
      if (!(requiredParam in parameters) || parameters[requiredParam] === undefined) {
        throw new Error(`Missing required parameter: ${requiredParam}`)
      }
    }

    for (const [paramName, paramValue] of Object.entries(parameters)) {
      if (!(paramName in properties)) {
        throw new Error(`Unknown parameter: ${paramName}`)
      }

      const paramDef = properties[paramName]
      if (paramDef.enum && !paramDef.enum.includes(paramValue)) {
        throw new Error(`Invalid value for ${paramName}. Must be one of: ${paramDef.enum.join(', ')}`)
      }
    }
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.definitions.values())
  }

  getToolDefinition(name: string): ToolDefinition | undefined {
    return this.definitions.get(name)
  }

  isToolRegistered(name: string): boolean {
    return this.tools.has(name)
  }

  getRegisteredTools(): string[] {
    return Array.from(this.tools.keys())
  }
}

export const toolRegistry = new ToolRegistry()