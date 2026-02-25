local greeter = import "greeter.libsonnet";

{
  fancy(name)::
    "✨ " + greeter.hello(name) + " ✨",
  card(name):: {
    greeting: greeter.hello(name),
    farewell: greeter.goodbye(name),
  },
}
