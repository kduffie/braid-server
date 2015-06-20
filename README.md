# Braid Server

Braid is a cross-platform solution for collaboration in a new way -- based on three principles:

- You should be in control of your information rather than having to trust any one cloud provider.  
- We favor simplicity over deep feature integration.  People won't use features they don't understand anyway. 
- You should have a lot of choice over the sharing components -- even inventing your own.

This project is an open-source implementation of a server that implements the Braid protocol.  This
implementation is built on node.js and its only mandatory external dependency is MongoDB.  (There are
additional optional dependencies when other kinds of integrations are desired, such as LDAP for
authentication, etc.)

## Installation

To run a braid server, you will need the following prerequisites:

- MongoDB:  You need to be running an instance of mongo.  See http://docs.mongodb.org/manual/installation This can run on the same machine as the Braid server, or on a different machine.  If you do a standard Mongo installation on the same machine, then the default mongoUrl in the Braid's configuration file should work fine.
- node.js:  Braid is written entirely in javascript and run using node.js.  You need to have node installed.  See https://nodejs.org/download/
- npm:  Braid depends on various node.js libraries that are not included in this repository.  npm is installed as part of node.js.  For more information, see http://blog.npmjs.org/post/85484771375/how-to-install-npm

Once you have the prerequisites in place, follow these steps:

1. Make sure you have an instance of MongoDb running.  It can be on the same server or elsewhere.

2. Install braid-server:  `npm install braid-server`

3. Create a copy of the config.json file in the root braid-server folder and place it somewhere under your control.  Then
edit that file to update things specific to your situation -- especially the domain, which should be configured to
a domain that is under your control.

4. Run braid-server:  `node braid-server <path-to-your-config-file>`

## Status

The server is still under development.  At this point, the server supports only the basics:

- *Accounts*:  registration and authentication of accounts within a domain
- *Subscriptions*:  a user can subscribe someone else to their presence
- *Presence*:  subscribers are notified when sessions start and end for one of the people they are subscribed to
- *Message delivery*:  clients can send braid-compatible messages to each other, using unicast or multicast

There is a lot more to come.  Stay tuned.

## Test Client

When running, the server also provides a simple web server running on port 8080 by default.  If you point a browser
there, you'll see that you can use a simple test client that will let you emulate a client to do some simple operations.