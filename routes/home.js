const secrets=require('../secrets.js');
const {Datastore} = require('@google-cloud/datastore');
const datastore = new Datastore(); 

/*
function generateState(length, chars) {
    //https://stackoverflow.com/questions/10726909/random-alpha-numeric-string-in-javascript
    var result = '';
    for (var i = length; i > 0; --i) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
}
*/

const routeHome = (req, res, next) => {

    /*
    var state = generateState(12, 'abcdefghijklmnopqrstuvwxyz1234567890');
    var datastoreKey = datastore.key("KEYS");

    const new_state = {
        "state": state
    }
    */
    context = {
        client_id: secrets.client_id,
        client_secret: secrets.client_secret,
        state: `client_state`
    }

    res.render('home', context);

    /*
    datastore.save({
        "key": datastoreKey,
        "data": new_state
    }).then( (key) => {
        console.log(`state is ${state}`);
        console.log(`key is ${key}`);
        const context = {
            client_id: secrets.client_id,
            client_secret: secrets.client_secret,
            client_state: state
            //client_id: "299092610499-u052ek5kcn5cg6hi99jj2nlu8lbnff16.apps.googleusercontent.com",
            //client_secret:"qLN4Y7t5ZYaHxWx4jzm8jw2O",
            //client_state: "placeholder_state"
        }
        res.render('home', context)
    });
    */
}

module.exports = routeHome
