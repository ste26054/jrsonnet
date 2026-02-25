{
  // Helper to create standard Kubernetes labels.
  labels(name, version="latest"):: {
    "app.kubernetes.io/name": name,
    "app.kubernetes.io/version": version,
    "app.kubernetes.io/managed-by": "jsonnet",
  },

  // Create a Kubernetes Deployment.
  deployment(name, image, replicas=1, port=80):: {
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: {
      name: name,
      labels: $.labels(name),
    },
    spec: {
      replicas: replicas,
      selector: { matchLabels: { "app.kubernetes.io/name": name } },
      template: {
        metadata: { labels: $.labels(name) },
        spec: {
          containers: [{
            name: name,
            image: image,
            ports: [{ containerPort: port }],
            resources: {
              requests: { cpu: "100m", memory: "128Mi" },
              limits: { cpu: "500m", memory: "256Mi" },
            },
          }],
        },
      },
    },
  },

  // Create a Kubernetes Service.
  service(name, port=80, targetPort=80):: {
    apiVersion: "v1",
    kind: "Service",
    metadata: {
      name: name,
      labels: $.labels(name),
    },
    spec: {
      selector: { "app.kubernetes.io/name": name },
      ports: [{
        port: port,
        targetPort: targetPort,
        protocol: "TCP",
      }],
    },
  },

  // Bundle a deployment + service for a microservice.
  microservice(name, image, replicas=1, port=80):: {
    deployment: $.deployment(name, image, replicas, port),
    service: $.service(name, port, port),
  },
}
