// Monitoring stack library — imports kubernetes.libsonnet transitively.
local k8s = import "kubernetes.libsonnet";

{
  // Create a Prometheus instance.
  prometheus(namespace="monitoring", replicas=1)::
    k8s.microservice(
      "prometheus",
      "prom/prometheus:v2.51.0",
      replicas=replicas,
      port=9090,
    ) {
      deployment+: {
        metadata+: { namespace: namespace },
        spec+: { template+: { spec+: { containers: [
          super.containers[0] {
            args: [
              "--config.file=/etc/prometheus/prometheus.yml",
              "--storage.tsdb.retention.time=15d",
            ],
            volumeMounts: [{ name: "config", mountPath: "/etc/prometheus" }],
          },
        ] } } },
      },
      service+: { metadata+: { namespace: namespace } },
    },

  // Create a Grafana instance.
  grafana(namespace="monitoring")::
    k8s.microservice(
      "grafana",
      "grafana/grafana:10.4.0",
      replicas=1,
      port=3000,
    ) {
      deployment+: {
        metadata+: { namespace: namespace },
        spec+: { template+: { spec+: { containers: [
          super.containers[0] {
            env: [
              { name: "GF_SECURITY_ADMIN_PASSWORD", value: "changeme" },
              { name: "GF_USERS_ALLOW_SIGN_UP", value: "false" },
            ],
          },
        ] } } },
      },
      service+: { metadata+: { namespace: namespace } },
    },

  // Full monitoring stack: Prometheus + Grafana.
  stack(namespace="monitoring", prometheusReplicas=1):: {
    prometheus: $.prometheus(namespace, prometheusReplicas),
    grafana: $.grafana(namespace),
  },
}
