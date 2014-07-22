
//
// NODE CHESS SERVER - responds to requests that send board positions with move results (mate-in-x).
//

var fs   = require( 'fs' );
var http = require( 'http' );

eval( fs.readFileSync( 'chessBase.js' ).toString() );

console.log( 'Node based chess server starting up.' );

var p1Type = bishopType, p2Type = knightType;

// Read data for bishop/knight endgame from pre-generated file
var prc = fs.readFileSync( "bishopKnight.dat", 'binary' );
console.log( 'End-game data succesfully read' );

// Create server to listen and respond to requests.
http.createServer( function (req, res) {

    var url = require( 'url' ).parse( req.url, true );
    var posx = url.query.posx;
    console.log( "got posx = " + posx );

    if ( posx )
    {
        res.writeHead( 200, {
            'Content-Type': 'text/plain',
            'Access-Control-Allow-Origin': '*'
        });
        //res.end( 'draw = ' + DRAW + 'answer = ' + prc[ posx ].charCodeAt( 0 ));
        res.end( JSON.stringify( getResults( posx )));
    }

}).listen( 1337, '127.0.0.1' );

console.log( 'Chess Server - running at http://127.0.0.1:1337/' )


//
// Code that gets chess results
//

function getResults( posx )
{
    var onMove = getOnMove( posx );
    var moves  = new Array( NUM_SQUARES );
    var results = {};

    var numMoves = getAllMoves( onMove, posx, false/*doKing*/, moves );
    for ( var ix = 0; ix < numMoves; ix++ )
    {
        var result = prc[ moves[ix] + getOnMoveBit( !onMove ) ];
        console.log( "move to " + moves[ix] + " = " + result.charCodeAt(0) );
        results[ moves[ix].toString() ] = result.charCodeAt(0);
    }
    console.log( " results = " + JSON.stringify( results ));
    return results;
}