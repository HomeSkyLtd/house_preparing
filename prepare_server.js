/*jshint esversion: 6 */

var mongo = require('mongodb');

var mongoClient = mongo.MongoClient;

const url = 'mongodb://localhost:27017/server-db';

mongoClient.connect(url)
            .then(db => {
                console.log("Connected!");
            })
            .catch(err => {
                console.log("Something wrong happened =(");
                console.log(err);
            });