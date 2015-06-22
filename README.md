# Braid Server

Braid is a cross-platform solution for collaboration in a new way -- based on three principles:

- You should be in control of your information rather than having to trust any one cloud provider.  
- We favor simplicity over deep feature integration.  People won't use features they don't understand anyway. 
- You should have a lot of choice over the sharing components -- even inventing your own.

This project is an open-source implementation of a server that implements the Braid protocol.  This
implementation is built on node.js and its only mandatory external dependency is MongoDB.

If you want to learn a lot more about Braid, visit our wiki:  https://github.com/kduffie/braid-server/wiki

## Installation

To run a braid server, you will need the following prerequisites:

- MongoDB:  You need to be run [an instance of MongoDB](http://docs.mongodb.org/manual/installation)
- node.js:  Braid is written entirely in javascript and run using node.js.  You need to have [node](https://nodejs.org/download/) installed.
- npm:  Braid depends on various node.js libraries that are not included in this repository.  npm is installed as part of node.js.

Once you have the prerequisites in place, follow these steps:

1. Make sure you have an instance of MongoDb running.  It can be on the same server or elsewhere.

2. Install braid-server:  

```bash
$ npm install braid-server -g
```

4. Run braid-server:  

```bash
$ node braid-server -d <domain>
```

Alternatively, if you want more control over the configuration, you can copy config.json from the braid-server
installation, make changes, and then start braid-server using: 

```bash
$ node braid-server -c <path-to-config-file>
```

## Status

The server is still under development.  At this point, the server supports:

- *Accounts*:  registration and authentication of accounts within a domain
- *Subscriptions*:  a user can subscribe someone else to their presence
- *Presence*:  subscribers are notified when sessions start and end for one of the people they are subscribed to
- *Message delivery*:  clients can send braid-compatible messages to each other, using unicast or multicast
- *Federation*:  braid servers for different domains can talk to each other and exchange messages between their clients

There is a lot more to come.  Stay tuned.

## Test Client

When running, the server also provides a simple web server.  By default, braid-server uses port
25555.  Point a browser to

```bash
http://localhost:25555
```
    
You'll see that you can use a simple test client that will let you emulate a client to do some simple operations.