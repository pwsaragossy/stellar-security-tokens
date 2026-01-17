# Running

## Starting Your Node[](#starting-your-node "Direct link to Starting Your Node")

Once you've [set up your environment](/docs/validators/admin-guide/prerequisites.md), [configured your node](/docs/validators/admin-guide/configuring.md), set up your [quorum set](/docs/validators/admin-guide/configuring.md), and selected archives to `get` [history from](/docs/validators/admin-guide/environment-preparation.md), you're ready to start Stellar Core.

Use a command equivalent to:

```
sudo systemctl start stellar-core
```

At this point, you're ready to observe your core node's activity as it joins the network.

You may want to skip ahead and review the [Logging](/docs/validators/admin-guide/logging.md) page to familiarize yourself with Stellar Core's output.

## Interacting With Your Instance[](#interacting-with-your-instance "Direct link to Interacting With Your Instance")

When your node is running, you can interact with Stellar Core via an administrative HTTP endpoint. Commands can be issued using command-line HTTP tools such as `curl`, or by running a CLI command such as

```
sudo -u stellar stellar-core --conf /etc/stellar/stellar-core.cfg http-command <http-command>
```

The HTTP endpoint is [not intended to be exposed to the public internet](/docs/validators/admin-guide/prerequisites.md). It's typically accessed by administrators, or by a mid-tier application to submit transactions to the Stellar network.

Details of available *HTTP* endpoint commands can be found in the [stellar-core-GitHub repo](https://github.com/stellar/stellar-core/blob/master/docs/software/commands.md#http-commands). Additionally, [the commands page](/docs/validators/admin-guide/commands.md) contains an overview of some of the most useful *CLI* commands (non-HTTP commands) for managing a running core node.

## Joining the Network[](#joining-the-network "Direct link to Joining the Network")

Your node will go through the following phases as it joins the network, and you can query for the output below by using the info endpoint mentioned [here](/docs/validators/admin-guide/monitoring.md) :

### Establish Connection to Other Peers.[](#establish-connection-to-other-peers "Direct link to Establish Connection to Other Peers.")

You should see `authenticated_count` increase.

```
"peers" : {  
  "authenticated_count" : 3,  
  "pending_count" : 4  
},
```

### Observing Consensus[](#observing-consensus "Direct link to Observing Consensus")

Until the node sees a quorum, it will say:

```
"state" : "Joining SCP"
```

After observing consensus, a new field `quorum` will display information about network decisions. At this point the node will switch to a "*Catching up*" state:

```
"quorum" : {  
  "qset" : {  
    "ledger" : 22267866,  
    "cost" : 20883268,  
    "agree" : 5,  
    "delayed" : 0,  
    "disagree" : 0,  
    "fail_at" : 3,  
    "hash" : "980a24",  
    "lag_ms" : 430,  
    "missing" : 0,  
    "phase" : "EXTERNALIZE"  
  },  
  "transitive" : {  
    "intersection" : true,  
    "last_check_ledger" : 22267866,  
    "node_count" : 21  
  }  
},  
"state" : "Catching up",
```

### Catching up[](#catching-up "Direct link to Catching up")

This is a phase where the node downloads data from any configured archives. This phase begins with something like:

```
"state" : "Catching up",  
"status" : [ "Catching up: Awaiting checkpoint (ETA: 35 seconds)" ]
```

And will then move through the various phases of downloading and applying state, such as:

```
"state" : "Catching up",  
"status" : [ "Catching up: downloading ledger files 20094/119803 (16%)" ]
```

You can specify how far back in time your node goes to catch up in your config file. If you set the `CATCHUP_COMPLETE` field to `true`, your node will replay the *entire history* of the network, which can take a long time. Weeks. You can speed up the process by copying existing archives from another full validator, using [`archivist` tool](/docs/validators/admin-guide/publishing-history-archives.md). Note that you only need to replay the complete network history if you're setting up a Full Validator. Otherwise, you can specify a starting point for catchup using the `CATCHUP_RECENT` field. To get in sync as fast as possible, simply use configuration defaults for `CATCHUP_RECENT` and `CATCHUP_COMPLETE`. See the [complete example configuration](https://github.com/stellar/stellar-core/blob/master/docs/stellar-core_example.cfg) for more details.

> **Info:** The `CATCHUP_COMPLETE` and `CATCHUP_RECENT` config fields are mutually exclusive. If the `CATCHUP_COMPLETE` field is set to `true`, the `CATCHUP_RECENT` field will be ignored.

### Synced[](#synced "Direct link to Synced")

When the node is done catching up, its state will change to:

```
"state" : "Synced!"
```