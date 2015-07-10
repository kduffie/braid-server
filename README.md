# Braid Server

Braid is a cross-platform solution for collaboration in a new way -- based on three principles:

- You should be in control of your information rather than having to trust any one cloud provider.  
- We favor simplicity over deep feature integration.  People won't use features they don't understand anyway. 
- You should have a lot of choice over the sharing components -- even inventing your own.

This project is an open-source implementation of a server that implements the Braid protocol.  This
implementation is built on node.js and its only mandatory external dependency is MongoDB.

If you want to learn a lot more about Braid, visit [our wiki](https://github.com/BraidApps/braid-server/wiki)

## Installation

To run a braid server, you will need the following prerequisites:

- MongoDB:  You need to be run [an instance of MongoDB](http://docs.mongodb.org/manual/installation)
- node.js:  Braid is written entirely in javascript and run using node.js.  You need to have [node](https://nodejs.org/download/) installed.
- npm:  Braid depends on various node.js libraries that are not included in this repository.  npm is installed as part of node.js.

Once you have the prerequisites in place, follow these steps:

- Make sure you have an instance of MongoDb running.  It can be on the same server or elsewhere.

- Install braid-server:  

```bash
$ npm install braid-server -g
```

(Note:  you may need to use `sudo` on Mac systems.)

- Run braid-server:  

```bash
$ braid-server -d <domain>
```

Alternatively, if you want more control over the configuration, you can copy config.json from the braid-server
installation, make changes, and then start braid-server using: 

```bash
$ braid-server -c <path-to-config-file>
```

## Getting Started

To get started, try out your braid server using the simple built-in test client.  Assuming you used the default port
assignments, you can now point a web browser to `http://localhost:25555`.  This should open up the server's website.
On that page, you'll see a link to a test client.  Click on it.

This test client lets you connect to the server as a braid client running inside your browser.  It does very little,
but allows you to see the basic interactions between a client and server.  

1. Open the browser's inspector and choose the Console tab so you can see what is happening between client and server.
2. Click on 'hello' to connect to the server and issue a 'hello' request.  
3. Enter credentials (e.g., 'joe', 'password'), check the 'register' box, and click 'connect'.
4. Once connected, additional panels will be displayed showing more things you can now do.
5. Open a second browser with a different browser identity (incognito if you prefer) -- so that browser cookies are distinct.
6. In the second browser, point to the same address and navigate to the test client.
7. Enter a second set of credentials (.e.g, 'bob', 'password'), check the register box, and click 'connect'.
8. Now you have two active clients against the same server.  
9. In the first browser, under Instant Messages, enter 'bob' in the 'recipient' field and enter a message then click 'send'.
10. In the second browser, you should see the message from joe appear.
11. To see subscriptions in action, try entering a userId in the subscribe area and click 'subscribe'.  Then refresh your browser and see how the other user receives notifications (in the inspector window).

Note that you can't federate your braid server until you can update DNS entries so that the server is associated with the braid service.

Learn more on our [wiki](https://github.com/BraidApps/braid-server/wiki)

## Status

The server is still under development.  At this point, the server supports:

- *Accounts*:  registration and authentication of accounts within a domain
- *Subscriptions*:  a user can subscribe someone else to their presence
- *Presence*:  subscribers are notified when sessions start and end for one of the people they are subscribed to
- *Message delivery*:  clients can send braid-compatible messages to each other, using unicast or multicast
- *Federation*:  braid servers for different domains can talk to each other and exchange messages between their clients
- *File services*: clients can upload and download files using HTTPS, optionally performing encryption in either case
- *Tiles*:  tiles are a way for distributed collaboration apps to maintain synchronized shared state information