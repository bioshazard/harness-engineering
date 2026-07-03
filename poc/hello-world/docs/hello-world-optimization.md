Exactly.

The hello world is not meant to stress capability. It’s meant to expose anatomy.

Modern models succeed, so you can perturb the harness:

```txt
reduce model size
shrink context
tighten budget
add ambiguous intent
hide current state
corrupt observations
add protected paths
make eval private
make reaction policy dumb
```

Then you get a useful curve:

```txt
capability threshold = smallest executor that succeeds under this harness
harness robustness = how much executor weakness/noise it tolerates
```

That’s actually product-relevant. The harness is good when weak executors still behave safely and strong executors can’t cheaply cheat.

So the benchmark isn’t “can GPT-5 write hello.txt?”

It’s:

```txt
how does harness design change the minimum intelligence required for reliable goal satisfaction?
```

That’s a strong pivot point.
