var config=require("./config.json");
var express=require("express");
var app=new express();
var Promise=require("bluebird");
var body_parser=require("body-parser");
var log=require("bunyan").createLogger({"name":"wiz"});
var mysql=require("mysql");
//Promise.promisifyAll(mysql);



// Serve static files from the public folder.  Default is index.html
app.use(express.static("public"));
app.use(body_parser.urlencoded({"extended" : true })); // For parsing x-www-form-urlencoded
app.get("/",function(req, res){

	res.sendfile("public/index.html");
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
	//conn.query("SELECT id, CONCAT_WS( ' ', street, city ) AS address, ROUND(3978 * acos(sin(?) * sin( RADIANS( y_coord ) ) + cos(?) * cos( RADIANS( y_coord ) ) * cos(? - RADIANS( x_coord ) )),2 ) AS distance from gis_addresses ORDER BY distance LIMIT 5", [lat, lat, lon], function(err, rows, fields){
	conn.query("SELECT DISTINCT gis.id, gis.address, gis.distance, if(ips.geolocation_id IS NULL AND cc.geolocation_id IS NULL, false, true) as cur_customer, if(t.geolocation_id IS NULL, false, true) as has_touch FROM (SELECT id, CONCAT_WS( ' ', street, city ) AS address, ROUND(3978 * acos(sin(?) * sin( RADIANS( y_coord ) ) + cos(?) * cos( RADIANS( y_coord ) ) * cos(? - RADIANS( x_coord ) )),2 ) AS distance FROM gis_addresses ORDER BY distance LIMIT 5) gis LEFT JOIN v2_ips ips ON gis.id=ips.geolocation_id LEFT JOIN (SELECT DISTINCT geolocation_id FROM customers c INNER JOIN v2_connections conn ON c.id=conn.customer_id) cc ON gis.id=cc.geolocation_id LEFT JOIN (SELECT DISTINCT geolocation_id FROM touches WHERE timestamp > DATE_SUB(CURDATE(), INTERVAL 60 DAY)) t ON gis.id=t.geolocation_id",[lat,lat,lon],function(err, rows, fields){
		conn.end();
		if(err){
			log.error(err.message);
			res.json({"status" : "error", "message" : err.code});

		} else {

			res.json({"status": "success", "data" : rows });
		}

	});

});

app.get("/employees/",function(req, res){
	var conn=mysql.createConnection(config.mysql);
	conn.connect();
	conn.query("SELECT c.id, CONCAT_WS( ' ', c.firstname, c.lastname) AS fullname FROM customers c, v2_permissions p WHERE p.customer_id=c.id AND ( p.permission='login' OR p.permission='superuser' ) AND c.timeclock_display='yes' ORDER BY fullname", function(err, rows, fields) {
		conn.end();
		if(err) {
			log.error(err.message);
			res.json({"status" : "error", "message" : err.code});
		} else {
			res.json({"status" : "success", "data" : rows });
		}

	});
});

app.get("/addresses/", function(req, res) {
	var addr_str = req.query.address;
	var conn=mysql.createConnection(config.mysql);
	conn.connect();
	conn.query("SELECT DISTINCT gis.id, gis.address, if(ips.geolocation_id IS NULL AND cc.geolocation_id IS NULL, false, true) as cur_customer, if(t.geolocation_id IS NULL, false, true) as has_touch FROM (SELECT id, CONCAT_WS( ' ', street, city ) AS address FROM gis_addresses WHERE street LIKE '"+addr_str+"%' ORDER BY address LIMIT 5) gis LEFT JOIN v2_ips ips ON gis.id=ips.geolocation_id LEFT JOIN (SELECT DISTINCT geolocation_id FROM customers c INNER JOIN v2_connections conn ON c.id=conn.customer_id) cc ON gis.id=cc.geolocation_id LEFT JOIN (SELECT DISTINCT geolocation_id FROM touches WHERE timestamp > DATE_SUB(CURDATE(), INTERVAL 60 DAY)) t ON gis.id=t.geolocation_id",function(err,rows,fields) {
	//conn.query("SELECT g.id, CONCAT_WS( ' ', g.street, g.city, g.zip ) as address, g.x_coord, g.y_coord from gis_addresses g WHERE g.street LIKE '"+addr_str+"%' LIMIT 5",function(err, rows, fields){
		conn.end();
		if(err) {
			log.error(err.message);
			res.json({"status" : "error", "message" : err.code});
		} else {
			res.json({"status" : "success", "data" : rows });
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
	conn.query("SELECT id FROM touches WHERE customer_id=? AND geolocation_id=? AND timestamp>DATE_SUB(CURDATE(),INTERVAL 7 DAY)",[parseInt(req.body.customer_id),parseInt(req.body.geolocation_id)], function(err, rows, fields) {
		if(err) {
			conn.end();
			log.error(err.message);
			res.json({"status" : "error", "message" : err.code});
		} else {
			if(rows.length > 0) {
				conn.end();
				res.json({"status" : "error", "message" : "You already touched this location"});

			} else {
				conn.query("INSERT INTO `touches` ( geolocation_id, customer_id, timestamp, notes ) VALUES ( ?,?, NOW(), ? )", [parseInt(req.body.geolocation_id), parseInt(req.body.customer_id), req.body.notes], function(err, rows, fields){
					conn.end();
					if(err){
						log.error(err.message);
						res.json({"status" : "error", "message" : err.code});

					} else {

						res.json({"status": "success", "data" : null });
					}

				});
			}
		}
	});



});


var server=app.listen(process.env.PORT || 8080, function (){

	log.info("Listening on %s",server.address().port);

});
