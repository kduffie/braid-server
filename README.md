#Braid Server

Braid is a cross-platform solution for collaboration in a new way -- based on three principles:

1. You should be in control of your information rather than having to trust any one cloud provider.  
2. We favor simplicity over deep feature integration.  People won't use features they don't understand anyway. 
3. You should have a lot of choice over the sharing components -- even inventing your own.

This project is an open-source implementation of a server that implements the Braid protocol.  This
implementation is built on node.js and its only mandatory external dependency is MongoDB.  (There are
additional optional dependencies when other kinds of integrations are desired, such as LDAP for
authentication, etc.)

##Installation

To run a braid server, follow these steps:

1. Download the contents of this repository onto a folder on your machine.
2. Copy the config.json file in the root folder to a new location, e.g. ~/braid-server.config.json.
3. Edit your new configuration file and update the domain to a domain or sub-domain (e.g., 'braid.mycorp.com')
4. If you don't already have Mongo, install and run it.  See http://docs.mongodb.org/manual/installation/.  If you install mongo on the same server, you shouldn't need to change the mongoUrl in the Braid configuration.
5. Start braid from a shell in Braid's root folder, pointing to your configuration file, e.g.,   **node braid-server ~/braid-server.config.json**


