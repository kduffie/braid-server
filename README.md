#Braid Server

Braid is a cross-platform solution for collaboration in a new way -- based on three principles:

- You should be in control of your information rather than having to trust any one cloud provider.  
- We favor simplicity over deep feature integration.  People won't use features they don't understand anyway. 
- You should have a lot of choice over the sharing components -- even inventing your own.

This project is an open-source implementation of a server that implements the Braid protocol.  This
implementation is built on node.js and its only mandatory external dependency is MongoDB.  (There are
additional optional dependencies when other kinds of integrations are desired, such as LDAP for
authentication, etc.)

##Installation

To run a braid server, you will need the following prerequisites:

- MongoDB:  You need to be running an instance of mongo.  See http://docs.mongodb.org/manual/installation This can run on the same machine as the Braid server, or on a different machine.  If you do a standard Mongo installation on the same machine, then the default mongoUrl in the Braid's configuration file should work fine.
- node.js:  Braid is written entirely in javascript and run using node.js.  You need to have node installed.  See https://nodejs.org/download/
- npm:  Braid depends on various node.js libraries that are not included in this repository.  npm is installed as part of node.js.  For more information, see http://blog.npmjs.org/post/85484771375/how-to-install-npm

Once you have the prerequisites in place, follow these steps:

1. Put the contents of this repository in a folder on your machine.  For example, let's suppose you put it in, e.g., ~/braid.

2. Modify the contents of config.json appropriate to your situation.  In particular, you should choose an appropriate domain that is under your control.  Alternatively, if you don't want to modify any of the repository files
you can make a copy of the config.json file and place it elsewhere.

3. From a shell with the current directory set to braid's root folder, install the dependencies;

	`npm install`  
	
	(If running on Mac, you may need to use:  `sudo npm install`)

4. Start the braid server:

	`node braid-server config.json`

Note:  If your configuration file is elsewhere, point to it, e.g., node braid-server ~/braid.config.json.

##Status

The server is still under development.  At this point, the server supports only the basics:

- *Accounts*:  registration and authentication of accounts within a domain
- *Subscriptions*:  a user can subscribe someone else to their presence
- *Presence*:  subscribers are notified when sessions start and end for one of the people they are subscribed to
- *Message delivery*:  clients can send braid-compatible messages to each other, using unicast or multicast

There is a lot more to come.  Stay tuned.

##Test Client

If you want to play around with the server, there is a test-only web client included in this repository.  This is not a real Braid client, but simply a tool for interacting with the server manually from a web page.

This client is implemented as a standalone web page.  It is not served from the braid server.  You simply open the *braid-client.html* file (found in the test-client folder) using a web browser.

Open the browser inspector so that you can see logging and network transactions between the client and server.   The test-client has only been tested using an up-to-date version of Chrome.

Note that the test client is hard-coded to access the server at 127.0.0.1, i.e. on the same machine.  If you want to access a remote server, modify the braid-client.html and change the URL accordingly.
