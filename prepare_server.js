/*jshint esversion: 6 */

var extend = require('util')._extend;
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

function incrementBE (buffer) {
    for (var i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i]++ !== 255) break;
    }
}

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
                    name: 'houseId',
                    message: 'Type the id of the house: '
                },
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
                var controllerId = answers.controllerId;
                if (/^\d+$/.test(controllerId))
                    controllerId = parseInt(controllerId);
                var houseId = answers.houseId;
                var data = fs.readFileSync(answers.filename).toString().split('\n');
                var header = data[0].split(' ');
                var nodesInfo = {};
                var questions = [];
                header.forEach((column) => {
                    if (column !== "" && column !== 'timestamp') {
                        questions.push({
                            type: 'input',
                            name: column + '.nodeId',
                            message: 'Type the nodeId of ' + column + ': '
                        });
                        questions.push({
                            type: 'list',
                            name: column + '.type',
                            message: column + ' is a:',
                            choices: [
                                { name: 'Data', value: 'data' },
                                { name: 'Command', value: 'command' }
                            ]
                        });
                        questions.push({
                            type: 'input',
                            name: column + '.dataId',
                            message: 'Type the dataId of ' + column + ': ',
                            when: (input) => {
                                return input[column + '.type'] === 'data';
                            }   
                        });
                        questions.push({
                            type: 'input',
                            name: column + '.commandId',
                            message: 'Type the commandId of ' + column + ': ',
                            when: (input) => {
                                return input[column + '.type'] === 'command';
                            }   
                        });
                    }
                });
                return inquirer.prompt(questions)
                    .then((answers) => {
                        var nodes = [];
                        var toInsert = [];
                        var timestampIndex = -1;
                        var start = mongo.ObjectID().id;
                        for (var i = 0; i < header.length; i++) {
                            if (header[i] !== "" && header[i] !== 'timestamp') {
                                incrementBE(start);
                                nodes[i] = {
                                    nodeId: parseInt(answers[header[i] + '.nodeId']),
                                    controllerId: controllerId,
                                    _id: mongo.ObjectID(new Buffer(start)),
                                    value: null
                                };
                                if (answers[header[i] + '.dataId'])
                                    nodes[i].dataId = parseInt(answers[header[i] + '.dataId']);
                                else
                                    nodes[i].commandId = parseInt(answers[header[i] + '.commandId']);
                            }
                            else {
                                nodes[i] = 'timestamp';
                                timestampIndex = i;
                            }
                        }
                        for (i = 1; i < data.length; i++) {
                            var line = data[i].split(' ');
                            var timestamp = parseInt(line[timestampIndex]);
                            console.log(line);
                            for (var j = 0; j < line.length; j++) {
                                if (j === timestampIndex)
                                    continue;
                                var value = parseInt(line[j]);
                                if (line[j].indexOf('.') != -1)
                                    value = parseFloat(line[i]);
                                if (value !== nodes[j].value) {
                                    console.log(mongo.ObjectID(start));
                                    incrementBE(start);
                                    toInsert.push(extend(nodes[j], { value: value, timestamp: timestamp, _id: mongo.ObjectID(new Buffer(start)) }));
                                    nodes[j].value = value;
                                }
                            }
                            if (i == 2)
                                break;
                        }
                        console.log(toInsert);
                        return db.collection("all_states_" + houseId).insertMany(toInsert)
                                    .then(() => {

                                        return db.collection("last_states_" + houseId).insertMany(
                                            nodes.filter(el => { return el !== 'timestamp'; }));
                                    });
                    });
            });
        }
    },
    {
        message: 'Exit',
        execute: () => {
            console.log("Bye!");
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