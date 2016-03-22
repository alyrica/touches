var config=require("./config.json");
var express=require("express");
var app=new express();
var Promise=require("bluebird");
var body_parser=require("body-parser");
var bunyan=require("bunyan");
var bsyslog=require("bunyan-syslog");
var log=bunyan.createLogger(
	{"name":"wiz",
	    streams: [ {
	        level: 'debug',
	        type: 'raw',
	        stream: bsyslog.createBunyanStream({
	            type: 'sys',
	            facility: bsyslog.daemon,
	            host: 'localhost',
	            port: 514
	        })}
   		]
	});
var mysql=require("mysql");
//Promise.promisifyAll(mysql);



// Serve static files from the public folder.  Default is index.html
app.use(express.static("public"));	
app.use(body_parser.urlencoded({"extend" : true })); // For parsing x-www-form-urlencoded
app.get("/",function(req, res){

	res.sendfile("public/index.html")
});

app.get("/geolocations/",function(req, res){

	if(!req.query.lat || !req.query.lon) {

		res.json({"error" : "Indexes disallowed. Please specify a location for search."});
		return;
	}

	var lat=req.query.lat*Math.PI/180;
	var lon=req.query.lon*Math.PI/180;
	var conn=mysql.createConnection(config.mysql);
	conn.connect();
	// Thanks http://tumblr.jonthornton.com/post/1419487206/calculate-latitude-longitude-distances-in-mysql-with
	conn.query("SELECT id, CONCAT_WS( ' ', street, city ) AS address, ROUND(3978 * acos(sin(?) * sin( RADIANS( y_coord ) ) + cos(?) * cos( RADIANS( y_coord ) ) * cos(? - RADIANS( x_coord ) )),2 ) AS distance from gis_addresses ORDER BY distance LIMIT 5", [lat, lat, lon], function(err, rows, fields){

		if(err){
			log.error(err.message);
			res.json({"status" : "error", "message" : err.code});

		} else {

			res.json({"status": "success", "data" : rows });
		}

	});

});





app.post("/touches",function(req, res){

	if(!req.body.geolocation_id || req.body.geolocation_id==0 || !req.body.customer_id || req.body.customer_id==0) {

		res.json({"error" : "Missing required parameter"});
		return;
	}

	var conn=mysql.createConnection(config.mysql);
	conn.connect();
	conn.query("INSERT INTO `touches` ( geolocation_id, customer_id, timestamp, notes ) VALUES ( ?,?, NOW(), ? )", [parseInt(req.body.geolocation_id), parseInt(req.body.customer_id), req.body.notes], function(err, rows, fields){

		if(err){
			log.error(err.message);
			res.json({"status" : "error", "message" : err.code});

		} else {

			res.json({"status": "success", "data" : null });
		}

	});

});





var server=app.listen(process.env.PORT || 8080, function (){

	log.info("Listening on %s",server.address().port);

});
