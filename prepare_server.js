/*jshint esversion: 6 */

var mongo = require('mongodb');
var inquirer = require('inquirer');
var fs = require('fs');
//Password
var bkfd2Password = require("pbkdf2-password");
var hasher = bkfd2Password(
    {
        saltLength: 8,
        iterations: 100000,
        digest: 'sha1',
        keyLength: 20
    });


var mongoClient = mongo.MongoClient;


const DEFAULT_URL = 'localhost:27017';
var db;

const ACTIONS = [
    {
        message: 'Erase server db',
        execute: () => {
            return db.dropDatabase();
        }
    },
    {

        message: 'Register controller',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'newHouse',
                    message: 'Do you want to create a new house for the controller?'
                },
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'So, what is the house id?',
                    when: (input) => {
                        return !input.newHouse;
                    }
                },
                {
                    type: 'input',
                    name: 'username',
                    message: 'What is the controller username?'
                },
                {
                    type: 'input',
                    name: 'password',
                    message: 'What is the controller password?',
                    default: 'mypass'
                }
            ]).then(answers => {
                return new Promise((accept, reject) => {
                    hasher({password: answers.password }, 
                        (err,pass,salt,hash) => { 
                            var savePass = 'AYag' + '$' + salt + '$' + hash;
                            accept(savePass);
                        });
                    })
                    .then((hash) => {
                        if (answers.newHouse) {
                            return db.collection("house").insertOne({})
                                .then((result) => {
                                    answers.houseId = result.insertedId.toString();
                                    console.log("Inserted house with id " + 
                                        answers.houseId);
                                    return hash;
                                });
                        }
                        return hash;
                    })
                    .then((hash) => {
                        return db.collection("agent").insertOne({
                            username: answers.username,
                            password: hash,
                            type: "controller",
                            houseId: answers.houseId
                        });
                    })
                    .then(result => {
                        console.log("Inserted controller with id " + 
                            result.insertedId.toString());
                    });
                });
        }
    },
    {
        message: 'Register node',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'editor',
                    name: 'nodeInfo',
                    message: 'Type the node info',
                    filter: (input) => {
                        return JSON.parse(input);
                    }
                }
                ])
                .then((answers) => {
                    //Find house id
                    db.collection("agent").findOne(
                        {
                            _id: answers.nodeInfo.controllerId
                        })
                        .then(result => {
                            return  {
                                houseId: result.houseId,
                                nodeInfo: answers.nodeInfo
                            };
                        });
                })
                .then(result => {
                    db.collection("node_" + result.houseId)
                        .insertOne(result.nodeInfo);
                });
        }
    },
    {
        message: 'Create administrator',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'newHouse',
                    message: 'Do you want to create a new house for the administrator?'
                },
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'So, what is the house id?',
                    when: (input) => {
                        return !input.newHouse;
                    }
                },
                {
                    type: 'input',
                    name: 'username',
                    message: 'What is the administrator username?'
                },
                {
                    type: 'input',
                    name: 'password',
                    message: 'What is the administrator password?',
                    default: 'mypass'
                }
            ]).then(answers => {
                return new Promise((accept, reject) => {
                    hasher({password: answers.password }, 
                        (err,pass,salt,hash) => { 
                            var savePass = 'AYag' + '$' + salt + '$' + hash;
                            accept(savePass);
                        });
                    })
                    .then((hash) => {
                        if (answers.newHouse) {
                            return db.collection("house").insertOne({})
                                .then((result) => {
                                    answers.houseId = result.insertedId.toString();
                                    console.log("Inserted house with id " + 
                                        answers.houseId);
                                    return hash;
                                });
                        }
                        return hash;
                    })
                    .then((hash) => {
                        return db.collection("agent").insertOne({
                            username: answers.username,
                            password: hash,
                            type: "admin",
                            houseId: answers.houseId
                        });
                    })
                    .then(result => {
                        console.log("Inserted administrator with id " + 
                            result.insertedId.toString());
                    });
                });
        }
    },
    {
        message: 'Insert data points from file',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'input',
                    name: 'controllerId',
                    message: 'Type the id of the controller: '
                },
                {
                    type: 'input',
                    name: 'filename',
                    message: 'Type the filename: '
                }
            ]).then(answers => {
                var data = fs.readFileSync(answers.filename).toString().split('\n');
                var header = data[0].split(' ');
                var nodesInfo = {};
                var questions = [];
                for (var i = 0; i < header.length; i++) {
                    if (header[i] !== "" && header[i] !== 'timestamp') {
                        questions.push({
                            type: 'input',
                            name: header[i] + '.nodeId',
                            message: 'Type the nodeId of ' + header[i] + ': '
                        });
                        if (i == header.length - 1) {
                            questions.push({
                                type: 'input',
                                name: header[i] + '.dataId',
                                message: 'Type the dataId of ' + header[i] + ': '   
                            });
                        }
                        else {
                            questions.push({
                                type: 'input',
                                name: header[i] + '.commandId',
                                message: 'Type the commandId of ' + header[i] + ': '   
                            });
                        }
                    }
                }
                
            });
        }
    },
    {
        message: 'Exit',
        execute: () => {
            process.exit();
        }
    }
    /*
    CREATE_RULE: 'Create rule',
    ACCEPT_NODE: 'Accept node',
    REMOVE_NODE: 'Remove node',
    INSERT_DATA_POINTS: ,*/
];

const QUESTIONS = [
    {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: ACTIONS.map((v,i) => { return { name: v.message, value: i }; })
    }
];

inquirer.prompt([
        {
            type: 'input',
            name: 'server',
            message: 'What is the address:port of the mongodb server?',
            default: DEFAULT_URL
        }
    ]).then(answers => {
        var url = 'mongodb://' + answers.server + '/server-db';
        mongoClient.connect(url)
            .then(pDb => {
                console.log("Connected to server-db!");
                db = pDb;
                return askAction();
            })
            .catch(err => {
                console.log("Something wrong happened =(");
                console.log(err.message);
                console.log(err);
               // process.exit();
            });
    }); 

function askAction() {
    return inquirer.prompt(QUESTIONS)
        .then(answers => {
            var action = answers.action;
            return ACTIONS[action].execute()
                        .then(() => {
                            console.log("Done!");
                        });

        })
        .then(askAction);
}