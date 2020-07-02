const express = require('express')
const exphbs = require('express-handlebars')
const path = require('path')

const secrets = require('./secrets.js');
const bodyParser = require('body-parser');

const {Datastore} = require('@google-cloud/datastore'); 
const datastore = new Datastore(); 

const {OAuth2Client} = require('google-auth-library');
const client = new OAuth2Client(secrets.client_id);
const DOMAIN = 'davisk8-portfolio-assignment.wn.r.appspot.com'

const jwt = require('express-jwt');
const jwksRsa = require('jwks-rsa');


const BOAT = 'Boat';
const SLIP = 'Slip';
const USER = 'User';

// Verify JWT - 
// function taken from google docs
// https://developers.google.com/identity/sign-in/web/backend-auth
// Added in as middleware to verify requests

async function verify(req, res, next) {
    if (!req.headers.authorization) {
        res.status(401).json({Error: "401 invalid or missing JWT"});
        return;
    }
    var items = req.headers.authorization.split(/[ ]+/);
    var id_token = items[1];

    const ticket = await client.verifyIdToken({
        idToken: id_token,
        audience: secrets.client_id
    }).catch((error) => {
        res.status(401).json({Error: "401 invalid or missing JWT"});
        return;
    });

    if (ticket === undefined) {
        res.status(401).json({Error: "401 invalid or missing JWT"});
        return;
    }
    const payload = await ticket.getPayload();
    const userid = payload['sub'];
    req.owner = userid;
    next();
}

function fromDatastore(item, req){
    item.id = item[Datastore.KEY].id;
    return item;
}

function selfLink(item, req, pathstr) {
    item.self = "https://" + req.hostname + pathstr + item.id; 
    return item;
}

/****************************************BOATS*********************************/
//Data model functions for boat entity

function get_boats(req){                                                      
    var results = {};
    var q = datastore.createQuery(BOAT).filter('owner', '=', req.owner).limit(5);                                      
    if(Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }

    return datastore.runQuery(q)
    .then( (entities) => {                          
        results.boats = entities[0].map(fromDatastore);
        results.boats.map( (item) => { return selfLink(item, req, '/boats/') });
        var promises = results.boats.map(get_boat_slip)
        return Promise.all(promises)
        .then((promises) => {
            results.boats = promises;
            if (entities[1].moreResults !== datastore.NO_MORE_RESULTS) {
                results.next = "https://" + req.hostname + "/boats/?cursor=" + encodeURIComponent(entities[1].endCursor);
            }
            var p = datastore.createQuery(BOAT).filter('owner', '=', req.owner);
            return datastore.runQuery(p)
            .then((boats) => {
                results.collection_size = boats[0].length;
                return results;
            });
        });
    });
}     

function get_boat(req){
    var boatKey = datastore.key([BOAT, parseInt(req.params.boat_id, 10)]);
    return datastore.get(boatKey)
    .then( (boat) => {
        if (boat[0] !== undefined) {
            boat[0] = fromDatastore(boat[0]);
            boat[0] = selfLink(boat[0], req, '/boats/');
            return boat[0] = get_boat_slip(boat[0])
            .then((boat) => {
                boat.slip = boat.slip.map(fromDatastore);
                boat.slip = boat.slip.map( item => {return selfLink(item, req, '/slips/')});
                return boat;
            });
        } else {
            return boat[0];
        }
    });
}

function get_boats_unprotected(){
    const q = datastore.createQuery(BOAT);
    return datastore.runQuery(q).then( (entities) => {
        return entities[0].map(fromDatastore);
    });
}

function post_boat(name, type, length, owner){
    var key = datastore.key(BOAT);
	const new_boat = {"name": name, "type": type, "length": length, "owner": owner};
	return datastore.save({"key":key, "data":new_boat}).then(() => {return key});
}

function patch_boat(name, type, length, id, owner) {
    var key = datastore.key([BOAT, parseInt(id, 10)]);
    const patched_boat = {
        "name": name,
        "type": type,
        "length": length,
        "owner": owner
    };
    return datastore.update({
        "key": key,
        "data": patched_boat
    })
    .then(() => {return patched_boat});
}

function delete_boat(boat){
    var boatKey = datastore.key([BOAT, parseInt(boat.id, 10)]);
    return datastore.delete(boatKey)
    .then((results) => {
        return get_boat_slip(boat)
        .then( (boat) => {
            boat.slip = boat.slip.map(fromDatastore);
            var promises = boat.slip.map(boat_departs);
            return Promise.all(promises)
        });
    });
}

/***************************************SLIPS**********************************/

function get_slips(req){                                                      
    var results = {};
    var q = datastore.createQuery(SLIP).limit(5);                                      
    if(Object.keys(req.query).includes("cursor")) {
        q = q.start(req.query.cursor);
    }

    return datastore.runQuery(q)
    .then( (entities) => {                          
        results.slips = entities[0].map(fromDatastore);
        results.slips.map( (item) => { return selfLink(item, req, '/slips/') });
        if (entities[1].moreResults !== datastore.NO_MORE_RESULTS) {
            results.next = "https://" + req.hostname + "/slips/?cursor=" + encodeURIComponent(entities[1].endCursor);
        }
        var p = datastore.createQuery(SLIP);
        return datastore.runQuery(p)
        .then((slips) => {
            results.collection_size = slips[0].length;
            return results;
        });
    });
}     

function get_slip(req){
    var slipKey = datastore.key([SLIP, parseInt(req.params.slip_id, 10)]);
    return datastore.get(slipKey)
    .then( (slip) => {
        if (slip[0] !== undefined) {
            slip[0] = fromDatastore(slip[0]);
            slip[0] = selfLink(slip[0], req, '/slips/');
        }
        return slip[0];
    });
}

function post_slip(name, length, cost){
    var key = datastore.key(SLIP);
	const new_slip = {"name": name, "length": length, "cost": cost, current_boat: null};
	return datastore.save({"key":key, "data":new_slip}).then(() => {return key});
}

function patch_slip(name, length, cost, current_boat, id) {
    var key = datastore.key([SLIP, parseInt(id, 10)]);
    const patched_slip = {
        "name": name,
        "length": length,
        "cost": cost,
        "current_boat": current_boat
    };
    return datastore.update({
        "key": key,
        "data": patched_slip
    });
}

function delete_slip(slip_id){
    var slipKey = datastore.key([SLIP, parseInt(slip_id, 10)]);
    return datastore.delete(slipKey);
}



/***************************************RELATIONSHIP FUNCTIONS*****************/

// boat arrives at slip
function put_slip(slip, boat) {
    const key = datastore.key([SLIP, parseInt(slip.id, 10)]);
    var new_slip = {
        "name": slip.name,
        "length": slip.length,
        "cost": slip.cost,
        "current_boat": boat.id
    }
    return datastore.save({
        "key": key,
        "data": new_slip
    });
}


// boat departs from slip
function boat_departs(slip) {
    if (slip === null || slip === undefined) return;
    const key = datastore.key([SLIP, parseInt(slip.id, 10)]);
    var new_slip = {
        "name": slip.name,
        "length": slip.length,
        "cost": slip.cost,
        "current_boat": null
    }
    return datastore.save({
        "key": key,
        "data": new_slip
    });
}

function get_boat_slip(boat) {
    var q = datastore.createQuery(SLIP).filter('current_boat', '=', boat.id);
    return datastore.runQuery(q)
    .then( (entities) => {
        if (entities[0] !== undefined) {
            boat.slip = entities[0];
        } else { 
            boat.slip = [];
        }
        return boat;
    });

}

/***************************************USERS**********************************/

function get_users(){
    const q = datastore.createQuery(USER);
    return datastore.runQuery(q).then( (entities) => {
        return entities[0].map(fromDatastore);
        });
}

/* ----------------------ERROR CODE HELPERS------------------------------ */

function accept_header(req) {
    const accepts = req.accepts(['application/json']);
    if (!accepts) return false;
    else return true;
}

//https://stackoverflow.com/questions/51741383/nodejs-express-return-405-for-un-supported-method
const methodNotAllowed = (req, res, next) => res.status(405).json({Error: "405 Method not allowed"});

/* ---------------------------------------------------------------------------*/

// require routes
// These routes are for the web app from Assignment 6...
// I am re-using so the grader can generate a JWT
const routeHome = require('./routes/home');
const routeAbout = require('./routes/about');
const routeUserInfo = require('./routes/userinfo');

const app = express()
app.use(bodyParser.json());

const router = express.Router()

// use express-handlebars view engine and set views template directory
const hbs = exphbs.create({
  partialsDir: __dirname + '/views/partials',
})

app.engine('handlebars', hbs.engine);
app.set('view engine', 'handlebars');
app.set('views', __dirname + '/views');

// serve static files form /public
app.use(express.static(path.resolve(__dirname, 'public'))) // serve static files

// Set your routes here
app.get('/', (req, res, next) => routeHome(req, res, next))
app.get('/about', (req, res, next) => routeAbout(req, res, next))
app.get('/userinfo', (req, res, next) => routeUserInfo(req, res, next))

/******************************************************************************/

app.route('/users')
.get(function(req, res) {
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
    }
    const users = get_users()
    .then ((users) => {
        res.status(200).json(users);
    });
})

.all(methodNotAllowed);

/*******************************BOAT ROUTES************************************/

//Get boats for owner
app.route('/boats')
.get(verify, function(req, res){
    const boats = get_boats(req)
    .then( (boats) => {
        if (!accept_header(req)) {
            res.status(406).json({Error: "406 Not Acceptable"});
        }
        res.status(200).json(boats);
    });
})

//CREATE
// Create a boat
.post(verify, function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({Error: '415 - Server only accepts application/json data.'})
        return;
    }
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
    }
    post_boat(req.body.name, req.body.type, req.body.length, req.owner)
    .then( key => {
        res.location("https://" + req.get('host') + req.baseUrl + '/' + key.id);
        res.status(201).json({
            id: key.id,
            name: req.body.name,
            type: req.body.type,
            length: req.body.length,
            self:"https://" + req.hostname + '/boats/' + key.id
        });
    });
})

.all(methodNotAllowed);

//READ
//Get a boat
app.route('/boats/:boat_id')
.get(verify, function(req, res) {
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    var boat = get_boat(req)
    .then( (boat) => {
        if (boat == undefined) {
            res.status(404).json({Error: "404 A boat with this boat_id doesn't exist"});
            return;
        }
        if (req.owner !== boat.owner){
            res.status(403).json({Error: '403 Forbidden'});
        } else { 
            res.status(200).json(boat);
        }
    });
})

//UPDATE
//Edit a boat with PATCH
.patch(verify, function(req, res) {
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({Error: '415 - Server only accepts application/json data.'})
        return;
    }
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    var boat = get_boat(req)
    .then( (boat) => {
        if (boat === undefined) {
            res.status(404).json({Error: "404 A boat with this boat_id doesn't exist"});
            return;
        }
        if (req.owner == boat.owner) {
            patch_boat(req.body.name, req.body.type, req.body.length, req.params.boat_id, req.owner)
            .then( res.status(200).json({
                id: req.params.boat_id,
                name: req.body.name,
                type: req.body.type,
                length: req.body.length,
                owner: req.owner,
                self: "https://" + req.hostname + "/boats/" + req.params.boat_id
            }));
        } else { 
            res.status(403).json({Error:'403 Forbidden'});
            return;
        }
    });
})

// Edit a boat with PUT
.put(verify, function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({Error: '415 - Server only accepts application/json data.'})
        return;
    }
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    var name;
    var type;
    var length;

    var boat = get_boat(req)
    .then( (boat) => {
        if (boat === undefined) {
            res.status(404).json({Error: "404 A boat with this boat_id doesn't exist"});
            return;
        }
        if (req.owner === boat.owner) {
            name = req.body.name || boat.name;
            type = req.body.type || boat.type;
            length = req.body.length || boat.length;
            
            return patch_boat(name, type, length, req.params.boat_id, req.owner)
        } else {
            res.status(403).json({Error: "403 Forbidden"});
            return;
        }
    }).then((boat) => {
            res.status(200).json({
                    id: req.params.boat_id,
                    name: boat.name,
                    type: boat.type,
                    length: boat.length,
                    owner: req.owner,
                    self: "https://" + req.hostname + "/boats/" + req.params.boat_id
            })
    });
})

//DELETE
// Delete a boat
.delete(verify, function(req, res){
    const boat = get_boat(req)
    .then( (boat) => {
        if (boat == undefined){
            res.status(404).json({Error: "404 A boat with this boat_id doesn't exist"});
        } else if (boat.owner !== req.owner) {
            res.status(403).json({Error: '403 Forbidden'});
        } else {
            delete_boat(boat)
            .then( (result) => {
                res.status(204).send();
            });
        }
    });
})

.all(methodNotAllowed);
/*****************************SLIP ROUTES**************************************/

// Get all slips
app.route('/slips')
.get(function(req, res){
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    const slips = get_slips(req)
    .then( (slips) => {
        res.status(200).json(slips);
    });
})

//CREATE
// Create a slip
.post( function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({Error: '415 - Server only accepts application/json data.'})
        return;
    }
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    post_slip(req.body.name, req.body.length, req.body.cost)
    .then( key => {
        res.location("https://" + req.get('host') + req.baseUrl + '/' + key.id);
        res.status(201).json({
            id: key.id,
            name: req.body.name,
            length: req.body.length,
            cost: req.body.cost,
            self:"https://" + req.hostname + '/slips/' + key.id
        });
    });
})

.all(methodNotAllowed);

//READ
//Get a slip
app.route('/slips/:slip_id')
.get(function(req, res) {
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    var slip = get_slip(req)
    .then( (slip) => {
        if(slip == undefined) {
            res.status(404).json({Error: "404 A slip with this slip_id doesn't exist"});
        } else {
            res.status(200).json(slip);
        }
    });
})

//UPDATE
//Edit a slip with PATCH
.patch(function(req, res) {
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({Error: '415 - Server only accepts application/json data.'})
        return;
    }
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    var slip = get_slip(req)
    .then( (slip) => {
        if (slip === undefined) {
            res.status(404).json({Error: "404 A slip with this slip_id doesn't exist"});
            return;
        }
        patch_slip(req.body.name, req.body.length, req.body.cost, req.body.current_boat, req.params.slip_id)
        .then( res.status(200).json({
            id: req.params.slip_id,
            name: req.body.name,
            length: req.body.length,
            cost: req.body.cost,
            current_boat: req.body.current_boat,
            self: "https://" + req.hostname + "/slips/" + req.params.slip_id
        }));
    });
})

// Edit a slip with PUT
.put(function(req, res){
    if(req.get('content-type') !== 'application/json'){
        res.status(415).json({Error: '415 - Server only accepts application/json data.'})
        return;
    }
    if (!accept_header(req)) {
        res.status(406).json({Error: "406 Not Acceptable"});
        return;
    }
    var name;
    var length;
    var cost;
    var current_boat;

    var slip = get_slip(req)
    .then( (slip) => {
        if (slip == undefined) {
            res.status(404).json({Error: "404 A slip with this slip_id doesn't exist"});
            return;
        } 
        name = req.body.name || slip.name;
        length = req.body.length || slip.length;
        cost = req.body.cost || slip.cost;
        current_boat = req.body.current_boat || slip.current_boat;
        
        return patch_slip(name, length, cost, current_boat, req.params.slip_id)
    }).then((slip) => {
        res.status(200).json({
            id: req.params.slip_id,
            name: name,
            length: length,
            cost: cost,
            current_boat: current_boat,
            self:"https://" + req.hostname + "/slips/" + req.params.slip_id
        });
    });
})

//DELETE
// Delete a slip
.delete(function(req, res){
    const slip = get_slip(req)
    .then( (slip) => {
        if (slip == undefined){
            res.status(404).json({Error: "404 A slip with this slip_id doesn't exist"});
        } else {
            delete_slip(req.params.slip_id)
            .then( (result) => {
                res.status(204).send();
            });
        }
    });
})

.all(methodNotAllowed);

/*********************RELATIONSHIP ROUTES**************************************/

// Boat arrives at slip
app.route('/slips/:slip_id/:boat_id')
.put(verify, function(req, res){
    const boat = get_boat(req);
    const slip = get_slip(req)

    Promise.all([boat, slip])
    .then( (values) => {
        var isValid = true;
        values.forEach(element => {
            if (element == undefined) {
                res.status(404).json({Error: "The specified boat and/or slip does not exist"});
                isValid = false;
            }
        });
        if (req.owner === values[0].owner){
            if (isValid) {
                if (values[1].current_boat != null){
                    res.status(403).json({Error: "The slip is not empty"});
                } else {
                    put_slip(values[1], values[0])
                    .then( (result) => {
                        res.status(204).end();
                    });
                }
            }
        } else {
            res.status(403).json({Error: '403 Forbidden'});
        }
    })
    .catch((error) => {console.log(error)});
})

// Boat leaves slip
.delete(verify, function(req, res) {
    const slip = get_slip(req)
    .then((slip) => {
        if ((slip) == undefined || slip.current_boat != req.params.boat_id){
            res.status(404).json({Error: "No boat with this boat_id is at this slip"});
        } else {
            boat_departs(slip)
            .then(() => {
                res.status(204).end();
            });
        }
    });
})

.all(methodNotAllowed);

/******************************************************************************/

app.use('/boats', router);

// Start the server
app.listen(process.env.PORT || 8080, () => console.log(`Express server listening on port ${process.env.PORT || 8080}!`))
