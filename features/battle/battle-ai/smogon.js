/**
 * Created by Chibi on 12/04/17.
 */

const request = require('request-json');
var client = request.createClient('http://smogon.com/');
//
module.exports = {
    downloadSet: function (name, gen, callback, index) {
        var params = {"gen":gen,"alias":name.toLowerCase()};
        client.post('http://www.smogon.com/dex/_rpc/dump-pokemon', params, function (err, res, body) {
            // do stuff with body
            if (body && body.strategies.length > 0) {
                var movesets = body.strategies[0].movesets;
                var set = movesets[Math.floor(Math.random() * movesets.length)];
                callback(err, set,  index);
            }
            else {
                if (params.gen === "xy") {
                    console.log("No set found!");
                    callback(err, null,  index);
                }
                else
                    module.exports.downloadSet(name, "xy", callback, index);
            }
        });
    },
};

var downloadSet = function(name, gen, callback){
    var params = {"gen":gen,"alias":name.toLowerCase()};
    console.log("checking for pokemon", params.alias, "in gen", params.gen);
    client.post('http://www.smogon.com/dex/_rpc/dump-pokemon', params, function(err, res, body) {
        // do stuff with body
         if( body && body.strategies.length>0){
            var movesets = body.strategies[0].movesets;
            var set = movesets[Math.floor(Math.random() * movesets.length)];
            callback(err, set);
        }
        else{
            if(params.gen==="xy"){
                console.log("No set found!");
                callback(err, null);
            }
            else
                downloadSet(name, "xy", callback);
        }
    });
};

downloadSet("Marowak-Alola", "sm", console.log);
