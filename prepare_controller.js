/*jshint esversion: 6 */

var mongo = require('mongodb');
var inquirer = require('inquirer');
var fs = require('fs');
require('console.table');
var Enum = require("enum");

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
const NETWORKS = new Enum({"tcp": 0, "xbee": 1});



const ACTIONS = [
    {
        message: 'Erase controller db',
        execute: () => {
            return db.dropDatabase();
        }
    },
    {
        message: 'List networks',
        execute: () => {
            return db.collection("networks").find().toArray()
                .then((networks) => {
                    console.table(networks.map(val => {
                        return {
                            type: NETWORKS.get(val.type),
                            params: JSON.stringify(val.params)
                        };
                    }));
                });
        }
    },
    {
        message: 'Insert TCP network',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'input',
                    name: 'rport',
                    message: 'Type the rport:',
                    default: 2356,
                    filter: (input) => {
                        return parseInt(input);
                    }
                },
                {
                    type: 'input',
                    name: 'broadcast_port',
                    message: 'Type the broadcast port:',
                    default: 2356,
                    filter: (input) => {
                        return parseInt(input);
                    }
                }])
                .then(answers => {
                    return db.collection('networks').insertOne({
                        type: 0,
                        params: {
                            rport: answers.rport,
                            broadcast_port: answers.broadcast_port,
                            udplisten: true
                        }
                    });
                });
        }
    },
    {
        message: 'Erase networks',
        execute: () => {
            return db.collection("networks").remove();
        }
    },
    {
        message: 'List rules',
        execute: () => {
            return db.collection("rules").find().toArray()
                .then(rules => {
                    console.table(rules);
                });
        }
    },
    {
        message: 'Insert rule',
        execute: () => {
            return inquirer.prompt([
                {
                    type: 'editor',
                    name: 'rule',
                    message: 'Type the rule (with clauses and command)',
                    filter: (input) => {
                        return JSON.parse(input);
                    }
                }])
                .then(answers => {
                    return db.collection('rules').insertOne(answers.rule);
                });
        }
    },
    {
        message: 'Erase rules',
        execute: () => {
            return db.collection("rules").remove();
        }
    },
    {
        message: 'List data/commands',
        execute: () => {
            return dataCommandChoices()
                .then(choices => {
                    console.table(choices);
                });
        }
    },
    {
        message: 'Accept node',
        execute: () => {
            return nodeChoices()
                .then(choices => {
                    return choices.map((val) => {
                        return {
                            name: JSON.stringify({
                                nodeId: val.id,
                                nodeClass: NODE_CLASSES.get(val.description.nodeClass),
                                accepted: val.accepted,
                                activated: val.activated,
                                dataType: val.description.dataType,
                                commandType: val.description.commandType
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
                    return db.collection("nodes").updateOne(answers.node,
                        { $set: { accepted: 1 }});
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
            name: 'controller',
            message: 'What is the address:port of the mongodb of the controller?',
            default: DEFAULT_URL
        }
    ]).then(answers => {
        var url = 'mongodb://' + answers.controller + '/controller';
        mongoClient.connect(url)
            .then(pDb => {
                console.log("Connected to controller database!");
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
    return db.collection("nodes").find().sort({id: 1}).toArray()
        .then(nodes => {
            return nodes;
    });
}

function dataCommandChoices() {
    return db.collection("nodes").find().sort({id: 1}).toArray()
        .then(nodes => {
            var promises = [];
            var infos = [];
            nodes.forEach((node) => {
                var addToInfos = (obj, isData) => {
                    if (obj) {
                        var array = Object.keys(obj).map(function (key) { return obj[key]; });
                        array.sort((a,b) => {
                            return a.id - b.id;
                        });
                        array.forEach(type => {
                            var newType = { 
                                nodeId: node.id,
                                kind: isData ? "data" : "command",
                                id: type.id,
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
                            if (type.unit)
                                newType.unit = type.unit;
                            newType.activated = node.activated;
                            newType.accepted = node.accepted;
                            infos.push(newType);
                        });
                    }
                };
                if (node.description) {
                    addToInfos(node.description.dataType, true);
                    addToInfos(node.description.commandType, false);
                }
            });
            /*infos.forEach((info) => {
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
            return Promise.all(promises);*/
            return infos;
    });
}