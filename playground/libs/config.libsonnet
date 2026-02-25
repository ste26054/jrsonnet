{
  // Base environment configuration.
  Env(name):: {
    name: name,
    replicas: 1,
    logLevel: "info",
    domain: name + ".example.com",
    features: {},
  },

  // Predefined environments with sensible defaults.
  envs: {
    dev: $.Env("dev") {
      logLevel: "debug",
      features: { debugToolbar: true, hotReload: true },
    },
    staging: $.Env("staging") {
      replicas: 2,
      domain: "staging.example.com",
      features: { debugToolbar: true },
    },
    production: $.Env("production") {
      replicas: 5,
      logLevel: "warn",
      domain: "example.com",
      features: { cdn: true, monitoring: true },
    },
  },

  // Generate a config for a given environment name.
  forEnv(envName)::
    local env = $.envs[envName];
    {
      app: {
        environment: env.name,
        replicas: env.replicas,
        logging: { level: env.logLevel },
        url: "https://" + env.domain,
      },
      features: env.features,
    },
}
