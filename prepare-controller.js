/*jshint esversion: 6 */

var mongo = require('mongodb');
var inquirer = require('inquirer');

var mongoClient = mongo.MongoClient;

const url = 'mongodb://localhost:27017/controller';
var db;
mongoClient.connect(url)
    .then(pDb => {
        console.log("Connected to server-db!");
        db = pDb;
        return inquirer.prompt([{
            type: 'confirm',
            name: 'erase',
            message: 'Would you like to erase the controller db?'
        }, {
            type: 
        }

        ]);
    })
    .then(answers => {
        console.log(answers);

    })
    .catch(err => {
        console.log("Something wrong happened =(");
        console.log(err);
    });