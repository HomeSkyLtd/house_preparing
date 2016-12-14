/*jshint esversion: 6 */

var mongo = require('mongodb');
var inquirer = require('inquirer');
var fs = require('fs');
require('console.table');
var crypto = require('crypto');
var Enum = require("enum");
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

/* Enums for specifif rainfall types */
const NODE_CLASSES = new Enum({"sensor":1, "actuator":2, "controller":4});
const DATA_TYPES = new Enum({"int": 1, "bool": 2, "real": 3, "string": 4 });
const MEASURE_STRATEGIES = new Enum({event: 1, periodic: 2});
const COMMAND_CATEGORIES = new Enum({"toggle": 1, "temperature": 2, "fan": 3, "lightswitch": 4, "acmode": 5,
        "lightintensity": 6, "lightcolor": 7, "custom": 8});
const DATA_CATEGORIES = new Enum({"temperature": 1, "luminance": 2, "presence": 3, "humidity": 4, "pressure": 5,
        "windspeed": 6, "smoke": 7, "custom": 8, "pressed": 9 });


var defaultHouseId = 1;

function generateToken(timestamp, nodeId, dataCommandID) {
    var objId = new mongo.ObjectID();
    var buf = objId.id;
    buf.writeInt32BE(timestamp);
    buf.writeInt32BE(nodeId, 4);
    buf.writeInt32BE(dataCommandID, 8);
    return new mongo.ObjectID(buf);
}
const ACTIONS = [
    {
        message: 'Erase server db',
        execute: () => {
            return db.dropDatabase();
        }
    },
    {
        message: 'Erase all data',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'What is the house id?',
                    default: defaultHouseId
                }
            ]).then(answers => {
                defaultHouseId = getNumber(answers.houseId);
                return db.collection("all_states_" + answers.houseId).remove()
                        .then(() => {
                            return db.collection("last_states_" + answers.houseId).remove();            
                        });
            });
        }
    },
    {
        message: 'Erase sensor/actuator',
        execute: () => {
            var houseId;
            return inquirer.prompt([
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'What is the house id?',
                    default: defaultHouseId
                }
            ]).then(answers => {
                houseId = answers.houseId;
                defaultHouseId = getNumber(answers.houseId);
                return nodeChoices(houseId);
            })
            .then(choices => {
                return choices.map((val) => {
                    return {
                        name: JSON.stringify({
                            controllerId: val.controllerId,
                            nodeId: val.nodeId,
                            nodeClass: NODE_CLASSES.get(val.nodeClass),
                            extra: val.extra,
                            dataType: val.dataType,
                            commandType: val.commandType
                        }),
                        value: {
                            _id: val._id
                        }
                    };
                });
            })
            .then((choices) => {
                return inquirer.prompt([
                    {
                        type: 'list',
                        name: 'node',
                        message: 'Choose the node to remove: ',
                        choices: choices
                    },
                ]);
            })
            .then((answers) => {
                return db.collection("node_" + houseId).deleteOne(answers.node);
            });
        }
    },
    {
        message: 'List data/commands',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'What is the house id?',
                    default: defaultHouseId
                }
            ]).then(answers => {
                    defaultHouseId = getNumber(answers.houseId);
                    return dataCommandChoices(answers.houseId);
                })
                .then(choices => {
                    console.table(choices.map((val) => {
                        if (val.extra && (typeof val.extra !== 'string' && !(val.extra instanceof String)))
                            val.extra = JSON.stringify(val.extra);
                        return val;
                    }));
                });
        }
    },
    {

        message: 'Register controller',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'confirm',
                    name: 'associateHouse',
                    default: false,
                    message: 'Do you want to associate a house with the controller?'
                },
                {
                    type: 'confirm',
                    name: 'newHouse',
                    default: false,
                    message: 'Do you want to create a new house for the controller?',
                    when: (input) => {
                        return input.associateHouse;
                    }
                },
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'So, what is the house id?',
                    default: defaultHouseId,
                    when: (input) => {
                        if (!input.associateHouse)
                            return false;
                        defaultHouseId = getNumber(input.houseId);
                        return !input.newHouse;
                    }
                },
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'What houseId do you want (0 for random value)?',
                    default: 0,
                    when: (input) => {
                        if (!input.associateHouse)
                            return false;
                        defaultHouseId = getNumber(input.houseId);
                        return input.newHouse;
                    }
                },
                {
                    type: 'input',
                    name: 'controllerId',
                    message: 'What is the controllerId (0 for random value)?',
                    default: 0,
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
                },
                {
                    type: 'input',
                    name: 'name',
                    message: 'What is the controller name?',
                    default: 'My Controller'
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
                        if (answers.associateHouse) {
                            if (answers.newHouse) {
                                answers.houseId = getNumber(answers.houseId);
                                if (answers.houseId === 0) {
                                    return db.collection("house").insertOne({})
                                        .then((result) => {
                                            answers.houseId = result.insertedId.toString();
                                            console.log("Inserted house with id " + 
                                                answers.houseId);
                                            return hash;
                                        });
                                }
                                else {
                                    return db.collection("house").insertOne({_id: answers.houseId})
                                        .then((result) => {
                                            console.log("Inserted house with id " + 
                                                answers.houseId);
                                            return hash;
                                        });   
                                }
                            }
                            answers.houseId = getNumber(answers.houseId);
                        }
                        return hash;
                    })
                    .then((hash) => {
                        answers.controllerId = getNumber(answers.controllerId);
                        var newController = {
                            username: answers.username,
                            password: hash,
                            type: "controller",
                            name: answers.name
                        };
                        if (answers.associateHouse)
                            newController.houseId = answers.houseId;
                        if (answers.controllerId !== 0)
                            newController._id = new mongo.ObjectID(answers.controllerId);
                        return db.collection("agent").insertOne(newController);
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
                    type: 'input',
                    name: 'houseId',
                    message: 'What is the house id?',
                    default: defaultHouseId
                },
                {
                    type: 'editor',
                    name: 'nodeInfo',
                    message: 'Type the node info',
                    filter: (input) => {
                        return JSON.parse(input);
                    }
                }
                ])
                .then(answers => {
                    db.collection("node_" + answers.houseId)
                        .insertOne(answers.nodeInfo);
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
                    default: defaultHouseId,
                    when: (input) => {
                        defaultHouseId = getNumber(input.houseId);
                        return !input.newHouse;
                    }
                },
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'What houseId do you want (0 for random value)?',
                    default: 0,
                    when: (input) => {
                        defaultHouseId = getNumber(input.houseId);
                        return input.newHouse;
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
                            answers.houseId = getNumber(answers.houseId);
                            if (answers.houseId === 0) {
                                return db.collection("house").insertOne({})
                                    .then((result) => {
                                        answers.houseId = result.insertedId.toString();
                                        console.log("Inserted house with id " + 
                                            answers.houseId);
                                        return hash;
                                    });
                            }
                            else {
                                return db.collection("house").insertOne({_id: answers.houseId})
                                    .then((result) => {
                                        console.log("Inserted house with id " + 
                                            answers.houseId);
                                        return hash;
                                    });   
                            }
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
        message: 'Insert data/command value',
        execute: () => {
            var timestamp = (new Date()).getTime();
            var houseId;
            return inquirer.prompt([
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'Type the id of the house: ',
                    default: defaultHouseId
                }])
                .then(answers => {
                    houseId = answers.houseId;
                    defaultHouseId = getNumber(answers.houseId);
                    return dataCommandChoices(houseId);
                })
                .then(choices => {
                    return choices.map((val) => {
                        return {
                            name: JSON.stringify(val),
                            value: val
                        };
                    });
                })
                .then((choices) => {
                    return inquirer.prompt([
                        {
                            type: 'list',
                            name: 'info',
                            message: 'Choose the data/command to insert: ',
                            choices: choices
                        },
                        {
                            type: 'input',
                            name: 'timestamp',
                            message: 'Type the timestamp: ',
                            default: timestamp
                        },
                        {
                            type: 'input',
                            name: 'value',
                            message: 'Type the value to insert: ',
                        }
                    ]);
                })
                .then(answers => {
                    // Convert answers to numbers where is possible
                    if (answers.timestamp)
                        answers.timestamp = getNumber(answers.timestamp);
                    if (answers.value)
                        answers.value = getNumber(answers.value);

                    var basicInfo = {
                        controllerId: answers.info.controllerId,
                        nodeId: answers.info.nodeId,
                    };
                    if (answers.info.kind === "data")
                        basicInfo.dataId = answers.info.id;
                    if (answers.info.kind === "command")
                        basicInfo.commandId = answers.info.id;
                    //Update last_states if this is the last timestamp
                    return db.collection("all_states_" + houseId).find(
                        basicInfo).sort({timestamp: -1}).nextObject()
                        .then(item => {
                            if (item) {
                                if (item.timestamp < answers.timestamp) {
                                    return db.collection("last_states_" + houseId).updateOne(
                                        { _id: item._id }, { $set: { value: answers.value }});
                                }
                            }
                            else {
                                return db.collection("last_states_" + houseId).insertOne(
                                    Object.assign(basicInfo, {
                                        value: answers.value
                                    }));
                            }
                        })
                        .then(() => {
                            return db.collection("all_states_" + houseId).insertOne(
                                Object.assign({
                                    timestamp: answers.timestamp,
                                    value: answers.value
                                }, basicInfo));
                        });
                           
                });
        }
    },
    {
        message: 'Insert data points from file',
        execute: () => {
            var timestamp = (new Date()).getTime();
            var choices;
            var houseId;
            return inquirer.prompt([
                {
                    type: 'input',
                    name: 'houseId',
                    message: 'Type the id of the house: ',
                    default: defaultHouseId
                }])
                .then(answers => {
                    defaultHouseId = getNumber(answers.houseId);
                    houseId = answers.houseId;
                    return dataCommandChoices(houseId);
                })
                .then(choices => {
                    return choices.map((val) => {
                        return {
                            name: JSON.stringify(val),
                            value: val
                        };
                    });
                })
                .then((loadedChoices) => {
                    choices = loadedChoices;
                })
                .then(() => {
                    return inquirer.prompt([{
                        type: 'input',
                        name: 'filename',
                        message: 'Type the filename: '
                    }]);
                }).then(answers => {
                    var controllerId = getNumber(answers.controllerId);
                    var data = fs.readFileSync(answers.filename).toString().split('\n');
                    var header = data[0].split(/(\s+)/).filter(val => { return val.trim() !== ""; });
                    var nodesInfo = {};
                    var questions = [];
                    header.forEach((column) => {
                        if (column !== "" && column !== 'timestamp') {
                            questions.push({
                                type: 'list',
                                name: column,
                                message: 'Choose the node of ' + column + ': ',
                                choices: choices
                            });
                        }
                    });
                    return inquirer.prompt(questions)
                        .then((answers) => {
                            var nodes = [];
                            var toInsert = [];
                            var timestampIndex = -1;
                            for (var i = 0; i < header.length; i++) {
                                if (header[i] !== "" && header[i] !== 'timestamp') {
                                    nodes[i] = {
                                        nodeId: answers[header[i]].nodeId,
                                        controllerId: answers[header[i]].controllerId,
                                        value: null,
                                        _id: new mongo.ObjectID()
                                    };
                                    if (answers[header[i]].kind === "data")
                                        nodes[i].dataId = answers[header[i]].id;
                                    else
                                        nodes[i].commandId = answers[header[i]].id;
                                }
                                else {
                                    nodes[i] = 'timestamp';
                                    timestampIndex = i;
                                }
                            }
                            for (i = 1; i < data.length; i++) {
                                var line = data[i].split(/(\s+)/).filter(val => { return val.trim() !== ""; });
                                if (line.length != header.length)
                                    continue;
                                var timestamp = parseInt(line[timestampIndex]);
                                for (var j = 0; j < line.length; j++) {
                                    if (j === timestampIndex)
                                        continue;
                                    var value = parseInt(line[j]);

                                    if (line[j].indexOf('.') !== -1) {
                                        value = parseFloat(line[j]);
                                    }
                                    if (value != nodes[j].value) {
                                        var toPush = { 
                                            nodeId: nodes[j].nodeId,
                                            controllerId: nodes[j].controllerId,
                                            value: value, 
                                            timestamp: timestamp,
                                            _id: new mongo.ObjectID()
                                        };
                                        if (nodes[j].dataId)
                                            toPush.dataId = nodes[j].dataId;
                                        else
                                            toPush.commandId = nodes[j].commandId;
                                        toInsert.push(toPush);
                                        nodes[j].value = value;
                                    }
                                }
                            }
                            if (toInsert.length === 0)
                                console.log("Nothing to insert");
                            return db.collection("all_states_" + houseId).insertMany(toInsert)
                                        .then(() => {
                                            //TODO: insert in all_states
                                           // return db.collection("last_states_" + houseId).insertMany(
                                               // nodes.filter(el => { return el !== 'timestamp' && el.value !== null; })
                                               //     .map((el) => {

                                                 //   }));
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
             process.exit();
            });
    }); 

function askAction() {
    return inquirer.prompt(QUESTIONS)
        .then(answers => {
            var action = answers.action;
            return ACTIONS[action].execute()
                        .then(() => {
                            console.log("\n\n\nDone!");
                        });

        })
        .then(askAction);
}

function getNumber(value) {
    if (/^\d+$/.test(value))
       return parseInt(value);
   return value;
}


function nodeChoices(houseId) {
    return db.collection("node_" + houseId).find({accepted: 1, alive: 1}).sort({controllerId: 1, nodeId: 1}).toArray()
        .then(nodes => {
            return nodes;
    });
}

function dataCommandChoices(houseId) {
    return db.collection("node_" + houseId).find({accepted: 1, alive: 1}).sort({controllerId: 1, nodeId: 1}).toArray()
        .then(nodes => {
            var promises = [];
            var infos = [];
            nodes.forEach((node) => {
                var addToInfos = (array, isData) => {
                    if (array) {
                        array.sort((a,b) => {
                            if (a.dataId && b.dataId)
                                return a.dataId - b.dataId;
                            if (a.dataId && !b.dataId)
                                return -1;
                            if (!a.dataId && b.dataId)
                                return 1;
                            return a.commandId - b.commandId;
                        });
                        array.forEach(type => {
                            var newType = { 
                                controllerId: node.controllerId,
                                nodeId: node.nodeId,
                                kind: isData ? "data" : "command",
                                id: type.id,
                                extra : node.extra
                            };
                            if (isData) {
                                newType.category = DATA_CATEGORIES.get(type.dataCategory).key;
                            }
                            else {
                                newType.category = COMMAND_CATEGORIES.get(type.commandCategory).key;
                            }
                            if (type.type)
                                newType.type = DATA_TYPES.get(type.type).key;
                            if (type.range)
                                newType.range = JSON.stringify(type.range);
                            infos.push(newType);
                        });
                    }
                };
                addToInfos(node.dataType, true);
                addToInfos(node.commandType, false);
            });
            infos.forEach((info) => {
                promises.push(db.collection("last_states_" + houseId).findOne({
                        nodeId: info.nodeId,
                        controllerId: info.controllerId,
                        id: info.id
                    }).then((val) => {
                        if (val !== null)
                            info["current value"] = val.value;
                        return info;
                    }));
            });
            return Promise.all(promises);
    });
}