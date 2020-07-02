const secrets = require('../secrets.js');
const request = require('request');
const axios = require('axios');
const fetch = require('node-fetch');
const {Datastore} = require('@google-cloud/datastore');  
const datastore = new Datastore(); 

const USER = 'User';

const bodyParser = require('body-parser');
const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(secrets.client_id);

const redirect_uri = "https://davisk8-portfolio-assignment.wn.r.appspot.com/userinfo";
var state_status="no"

function getPerson(url, authKey) {
    return fetch(url, {
        method:'GET',
        mode: 'cors',
        headers: {
            Authorization: authKey
        }
    }).then(response => {
        return response.json();
    });
}

async function getUserData(jwt) {
    const ticket = await client.verifyIdToken({
        idToken: jwt,
        audience: secrets.client_id
    }).catch((error) => {
        res.status(401).send("401 invalid or missing JWT");
        return;
    });

    if(ticket === undefined) {
        res.status(401).send("401 invalid or missing JWT");
        return;
    }
    const payload = await ticket.getPayload();
    const userId = payload['sub'];
    const givenName = payload['given_name'];
    const familyName = payload['family_name'];
    const emailAddress = payload['email'];

    const user = {
        userId: userId,
        givenName: givenName,
        familyName: familyName,
        email: emailAddress,
        jwt: jwt
    }
    return user;
}

function userExists(userId) {
    console.log(`userId is ${userId}`);
    var q = datastore.createQuery(USER).filter('userId', '=', userId);
    return datastore.runQuery(q)
    .then( (users) => {
        console.log(`users is ${users[0]}`);
        if (users[0].length > 0) {
            return true;
        } else {
            return false;
        }
    });
}

/*
function verify_state(state) {
    const q = datastore.createQuery("KEYS").filter('state', '=', state);   
    return datastore.runQuery(q).then( (entities) => { 
        console.log("retreving from datastore..printing entities");
        console.log(entities);
        if (entities[0].length > 0) {
            console.log(entities[0].length);
            console.log(`state_status is ${state_status}`);
            state_status = "yes";
            console.log(`state_status is ${state_status}`);
            return true;
        } else return false;
    });
}
*/

const routeUserInfo = (req, res, next) => {
    //const state = req.query.state;
    const code = req.query.code;


    //token_url = "https://www.googleapis.com/oauth2/v4/token"
    token_url = "https://oauth2.googleapis.com/token";
    api_url = "https://people.googleapis.com/v1/people/me?personFields=names,emailAddresses";

    const headers = {
        'Content-Type': 'application/x-www-form-urlencoded'
    }

    

    request.post(
        {
            url: token_url,
            form: {
                code: code,
                client_id: secrets.client_id,
                client_secret: secrets.client_secret,
                redirect_uri: redirect_uri,
                grant_type: 'authorization_code'
            }
        },
        (err, response, body) => {
            // console.log(response)
            const data = JSON.parse(response.body);
            const jwt = data.id_token;

            userInfo = getUserData(jwt)
            .then( userInfo => {
                console.log(`userInfo.userId is ${userInfo.userId}`);
                userExists(userInfo.userId)
                .then( (result) => {
                    if (result) {
                        userInfo.userStatus = "User already exists"
                    } else {

                        var key = datastore.key(USER);
                        const new_user = {
                            "firstName": userInfo.givenName,
                            "lastName": userInfo.familyName,
                            "email": userInfo.email,
                            "userId": userInfo.userId
                        };
                        datastore.save({"key": key, "data": new_user});
                        userInfo.userStatus = "A new user was created";
                    }
                    res.render('userInfo', userInfo);
                });
            });
            /*
            getPerson(api_url, full_token)
            .then( (people) => {
                context = {
                    first_name: people.names[1].givenName,
                    last_name: people.names[1].familyName,
                    state: 'state',
                    state_status: 'verified',
                    jwt: jwt
                }
                res.render('userInfo', context);
            })
            .catch((err) => {
                console.log("Error in getPerson async")
                context = {
                    jwt: jwt
                }
                res.render('userInfo', context);
            });
            */
        });
}

module.exports = routeUserInfo
