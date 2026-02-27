type FlagValue = boolean

class FeatureFlags {
  private overridesByEnv: Map<string, Map<string, FlagValue>> = new Map()

  getEnvScope(): string {
    return process.env.RUNARA_ENV || process.env.NODE_ENV || 'development'
  }

  isEnabled(flagName: string, defaultValue: boolean = false): boolean {
    const env = this.getEnvScope()
    const envOverrides = this.overridesByEnv.get(env)
    if (envOverrides && envOverrides.has(flagName)) {
      return Boolean(envOverrides.get(flagName))
    }
    const envValue = process.env[flagName]
    if (typeof envValue === 'string') {
      return envValue.toLowerCase() === 'true'
    }
    return defaultValue
  }

  setFlag(flagName: string, value: boolean): void {
    const env = this.getEnvScope()
    const envOverrides = this.overridesByEnv.get(env) || new Map<string, FlagValue>()
    envOverrides.set(flagName, value)
    this.overridesByEnv.set(env, envOverrides)
  }

  clearFlag(flagName: string): void {
    const env = this.getEnvScope()
    const envOverrides = this.overridesByEnv.get(env)
    if (envOverrides) {
      envOverrides.delete(flagName)
    }
  }

  getFlagValue(flagName: string, defaultValue: boolean = false): boolean {
    return this.isEnabled(flagName, defaultValue)
  }
}

let featureFlagsInstance: FeatureFlags | null = null

export function getFeatureFlags(): FeatureFlags {
  if (!featureFlagsInstance) {
    featureFlagsInstance = new FeatureFlags()
  }
  return featureFlagsInstance
}
