/*jshint esversion: 6 */

var mongo = require('mongodb');
var inquirer = require('inquirer');

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
            return new Promise();
        }
    }/*,
    REGISTER_NODE: 'Register node',
    CREATE_USER: 'Create administrator',
    CREATE_RULE: 'Create rule',
    ACCEPT_NODE: 'Accept node',
    REMOVE_NODE: 'Remove node',
    INSERT_DATA_POINTS: 'Insert data points from file',
    EXIT: 'Exit'   */
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
            });
    });

function askAction() {
    return inquirer.prompt(QUESTIONS)
        .then(answers => {
            var action = answers.action;
            return ACTIONS[action]()
                        .then(() => {
                            console.log("Done!");
                        });

        })
        .then(askAction);
}


function askJSON(jsonFormat, message) {
    return inquirer.prompt([{
        type: 'editor',
        name: 'obj',
        message: message
    }]);
}