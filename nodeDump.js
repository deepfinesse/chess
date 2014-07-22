console.log( 'hi bill');

var fs = require( 'fs' );


//
// BASIC TOOLS
//

var SKIP_ANALYSIS   = false;
var ENDGAME_TYPE    = "BISHOP_BISHOP";  // BISHOP_BISHOP, BISHOP_KNIGHT, ROOK, QUEEN

var NUM_THREADS = 1;
var SHOW_RESULT_THRESHOLD = 1;
var piece1;
var piece2;

var prc;
var PRC_SIZE;
var NUM_PLYRS = 2;

//
// PIECES AND POSITIONS
//

var BLACK       = 0;
var WHITE       = 1;
var NUM_SQUARES = 64;

// pieceLoc holds 0-63 representing square location.
function xloc( pieceLoc ) { return pieceLoc % 8; }
function yloc( pieceLoc ) { return pieceLoc >> 3; }

// Constants used by PieceType object below
var ANY_MOVE_LENGTH     = 0;
var ONE_MOVE_LENGTH     = 1;

// Object representing different piece types and their characteristics
function PieceType( printChar, unicodeChar, numMovements, moveLength, movements ) {
    this.printChar = printChar;
    this.unicodeChar = unicodeChar;
    this.numMovements = numMovements;
    this.moveLength = moveLength;
    this.movements = movements;
}

var wKingType   = new PieceType( "K", 9812, 8, ONE_MOVE_LENGTH, [-9, -8, -7, -1, 1, 7, 8, 9] );
var bKingType   = new PieceType( "k", 9818, 8, ONE_MOVE_LENGTH, [-9, -8, -7, -1, 1, 7, 8, 9] );
var queenType   = new PieceType( "Q", 9813, 8, ANY_MOVE_LENGTH, [-9, -8, -7, -1, 1, 7, 8, 9] );
var rookType    = new PieceType( "R", 9814, 4, ANY_MOVE_LENGTH, [-1, 1, -8, 8] );
var knightType  = new PieceType( "N", 9816, 8, ONE_MOVE_LENGTH, [-17, -15, -10, -6, 6, 10, 15, 17] );
var bishopType  = new PieceType( "b", 9815, 4, ANY_MOVE_LENGTH, [-9, -7, 7, 9] );


// board position gloms together 4 piece locations in 24 total bits: 2^24 = 16M locations
function getPosx( bking, wking, p1loc, p2loc ) { return (( (piece2 != null ? p2loc : 0) * NUM_SQUARES + p1loc) * NUM_SQUARES + wking) * NUM_SQUARES + bking; }

// Get piece location from board position
function bkingLoc(  posx ) { return ( posx >>  0 ) & 0x3f; }
function wkingLoc(  posx ) { return ( posx >>  6 ) & 0x3f; }
function piece1Loc( posx ) { return ( posx >> 12 ) & 0x3f; }
function piece2Loc( posx ) { return piece2 != null ? ( posx >> 18 ) & 0x3f : -1; }
function getOnMoveBit( onMove ) { return piece2 != null ? onMove << 24 : onMove << 18; }


// Given a pieceType and the current position, return an array of position indexes that result from all possible moves of the piece
function getPieceMoves( piece, posx, moves, movex )
{
    var bking  = bkingLoc(  posx );
    var wking  = wkingLoc(  posx );
    var p1loc  = piece1Loc( posx );
    var p2loc  = piece2Loc( posx );

    var me    = ( piece == bKingType ? bking : piece == wKingType ? wking : piece == piece1 ? p1loc : p2loc );
    var other = ( piece == bKingType || piece == wKingType || piece2 == null ? -1 : piece == piece1 ? p2loc : p1loc );

    for ( var ix = 0; ix < piece.numMovements; ix++ )
    {
        var bump = (piece.moveLength == ANY_MOVE_LENGTH ? piece.movements[ ix ] : - NUM_SQUARES);
        for ( var prev = me, next = me + piece.movements[ ix ];
              next >= 0 && next < NUM_SQUARES && next != wking && (next != other || next == bking) && Math.abs( xloc(prev) - xloc(next) ) <= 2;
              prev = next, next += bump )
        {
            moves[ movex++ ] = getPosx( piece == bKingType ? next : bking,
                piece == wKingType ? next : wking,
                piece == piece1    ? next : p1loc,
                piece == piece2    ? next : p2loc );
            if ( next == bking )
                break;
        }
    }
    return movex;
}


// Given the side on move and the current position, return an array of position indexes that result from all possible moves of all pieces
function getAllMoves( onMove, posx, skipKing, moves )
{
    // Try all possible king moves.
    var movex = 0;
    if ( !skipKing )
        movex = getPieceMoves( onMove == BLACK ? bKingType : wKingType, posx, moves, movex );

    if ( onMove == WHITE )
    {
        movex = getPieceMoves( piece1, posx, moves, movex );
        if ( piece2 != null )
            movex = getPieceMoves( piece2, posx, moves, movex );
    }
    return movex;
}


//
// PRC: Position Result Cache (byte array)
//
// Index is board position, result is death-in-x value (moves left by white to death).
// Separate cache for black-to-move (btm) and white-to-move (wtm)
//

/*

 3 . K .             3 . K .             3 . K .             3 . K .              3 . K .
 2 . . R    ka1 ->   2 . . R    Rc1 ->   2 . . .    kb2 ->   2 . . .    Rxb2 ->   2 . . .
 1 . k .             1 k . .             1 k . R             1 . k R              1 . R .
 a b c               a b c               a b c               a b c                a b c

 mate-in-1           mate-in-1              mate              kill                 death
 prc_btm:2           prc_wtm:2            prc_btm:1          prc_wtm:1            prc_btm:0


 Identifying stalemate (vs mate). If the position with btm looks like mate initially, check if
 wtm leads to immediate death. If not, then it is stalemate, not mate.

 3 . K .             3 . K .             3 . K .
 2 . R .             2 . R .             2 . . .
 1 k . .             1 . k .             1 . R .
 a b c               a b c               a b c

 stalemate            post-mate             death
 prc_btm:1            prc_wtm:1           prc_btm:0

 */

// White tries to minimize mate-in-x, black tries to maximize. So we give DRAW max positive value
// as it discourages white, encourages black to seek it.
var DRAW			    = 127;
var UNRESOLVED		    = 126;
var ILLEGAL			    = 125;   // eg. kings adjacent to each other, white rook on white king, etc
var MAX_MOVES_TO_MATE   = 50;
var MATE			    = 1;     // One move left to death
var DEATH			    = 0;     // Black king is captured by white

function prcLookup( onMove, posx ) { return prc[ posx + getOnMoveBit( onMove ) ]; }
function prcSet( onMove, posx, moves ) { prc[ posx + getOnMoveBit( onMove ) ] = moves; return true; }


//
// PRINT AND DEBUG METHODS
//

function printWhiteMoves( posx, results )
{
    var moves = new Array( NUM_SQUARES );
    var nposx = -1;
    var best  = UNRESOLVED;

    var numMoves = getAllMoves( WHITE, posx, false/*doKing*/, moves );
    for ( var ix = 0; ix < numMoves; ix++ )
    {
        var wking  = wkingLoc( moves[ix] );
        var p1loc  = piece1Loc( moves[ix] );
        var p2loc  = piece2Loc( moves[ix] );
        var result = prcLookup( BLACK, moves[ix] );

        if ( wking != wkingLoc( posx ) && (result < results[ wking ] || result == DRAW  ))
            results[ wking ] = result;

        if ( p1loc != piece1Loc( posx ) && (result < results[ p1loc ] || result == DRAW ))
            results[ p1loc ] = result;

        if ( piece2 != null && p2loc != piece2Loc( posx ) && (result < results[ p2loc ] || result == DRAW ))
            results[ p2loc ] = result;

        if ( result <= best )
        {
            nposx = moves[ ix ];
            best  = result;
        }
    }
    return { 'bestPosx' : nposx,
        'bestResult' : best };
}

function printBlackMoves( posx, results )
{
    var best  = -1;
    var nposx = -1;
    var moves = new Array( NUM_SQUARES );

    // Try all possible king moves.
    var numMoves = getAllMoves( BLACK, posx, false/*doKing*/, moves );
    for ( var ix = 0; ix < numMoves; ix++ )
    {
        var result = prcLookup( WHITE, moves[ix] );
        if ( result > MATE )
        {
            results[ bkingLoc( moves[ix] )] = result;
            if ( result > best && result < MAX_MOVES_TO_MATE )
            {
                best  = result;
                nposx = moves[ix];
            }
        }
    }
    return { 'bestPosx': nposx == -1 ? posx : nposx,
        'bestResult': best };
}


function printBoard( onMove, posx, showMoves )
{
    var bking = bkingLoc( posx );
    var wking = wkingLoc( posx );
    var p1loc = piece1Loc( posx );
    var p2loc = piece2Loc( posx );
    var moves = prcLookup( onMove, posx );

    var results = new Array( NUM_SQUARES );
    var  bestPosx = -1;
    if ( showMoves )
    {
        for ( var ix = 0; ix < NUM_SQUARES; ix++ )
            results[ ix ] = UNRESOLVED;

        if ( onMove == WHITE )
            bestPosx = printWhiteMoves( posx, results).bestPosx;
        else
            bestPosx = printBlackMoves( posx, results).bestPosx;
    }

    if ( onMove == BLACK && moves == 1 )
        console.log( "Mate!\n" );
    else
        console.log( "%s:mate-in-%d\n", onMove == WHITE ? "WTM" : "BTM", moves - 1);

    for ( var yloc = 0; yloc < 8; yloc++ )
    {
        var boardLine = "";
        for ( var xloc = 0; xloc < 8; xloc++ )
        {
            var loc = yloc * 8 + xloc;
            if ( loc == bking )
                boardLine += "k";
            else if ( loc == wking )
                boardLine += "K";
            else if ( loc == p1loc )
                boardLine += piece1.printChar;
            else if ( piece2 != null && loc == p2loc )
                boardLine += piece2.printChar;
            else
            {
                var delta = onMove == WHITE ? results[ loc ] - moves + 1 : moves - results[ loc ];
                if ( showMoves && results[ loc ] != UNRESOLVED && delta >= 0 && delta <= 9 && ( onMove == BLACK || delta <= SHOW_RESULT_THRESHOLD ))
                    boardLine += delta;
                else
                    boardLine += "+";
            }
            boardLine += " " ;
        }
        console.log( boardLine );
    }
    console.log( "\n" );
    return bestPosx;
}

function printResults()
{
    var prcCount  = new Array( NUM_PLYRS );
    prcCount[ 0 ] = new Array( 128 );
    prcCount[ 1 ] = new Array( 128 );

    // Scan cache counting results
    for ( var posx = 0; posx < PRC_SIZE; posx++ )
        for ( onMove = WHITE; onMove >= BLACK; onMove-- )
        {
            var moves = prcLookup(onMove, posx);
            if (prcCount[ onMove ][ moves ] == undefined)
                prcCount[ onMove ][ moves ] = 0;
            prcCount[ onMove ][ moves ] += 1;
        }

    console.log( "  Illegal positions       = %d", prcCount[ WHITE ][ ILLEGAL ]);
    console.log( "     Draw positions (BTM) = %d", prcCount[ BLACK ][ DRAW ]);
    console.log( "     Draw positions (WTM) = %d", prcCount[ WHITE ][ DRAW ]);
    console.log( "    Death positions (BTM) = %d", prcCount[ BLACK ][ DEATH ]);
    console.log( "     Kill positions (WTM) = %d", prcCount[ WHITE ][ MATE ]);
    console.log( "     Mate positions (BTM) = %d", prcCount[ BLACK ][ MATE ]);

    for ( var ix = 2; ix < MAX_MOVES_TO_MATE; ix++ )
        for ( var onMove = WHITE; onMove >= BLACK; onMove-- )
            if ( prcCount[ onMove][ ix ] > 0 )
                console.log( "Mate-in-%d positions (%s) = %d", ix-1, onMove == WHITE ? "WTM" : "BTM", prcCount[ onMove ][ ix ]);
}


//
// SEARCH ROUTINES
//


var movesArray = new Array( NUM_SQUARES );

// Populates all ILLEGAL positions.
// Seeds DEATH positions (btm) and DEATH in one (wtm) as starting point for search.
// All other positions marked uninitialized or DRAW
function seedCache()
{
    PRC_SIZE = NUM_SQUARES * NUM_SQUARES * NUM_SQUARES * ( piece2 != null ? NUM_SQUARES : 1);
    prc = new Uint8Array( PRC_SIZE * NUM_PLYRS );

    for ( var posx = 0; posx < PRC_SIZE; posx++ )
    {
        var bking = bkingLoc( posx );
        var wking = wkingLoc( posx );
        var p1loc = piece1Loc( posx );
        var p2loc = piece2Loc( posx );

        // Most positions are initially unresolved
        prcSet( BLACK, posx, UNRESOLVED );
        prcSet( WHITE, posx, UNRESOLVED );

        // Set illegal positions
        var kingsTooClose       = (Math.abs( xloc(bking) - xloc(wking) ) <= 1 && Math.abs( yloc(bking) - yloc(wking) ) <= 1);
        var whitePieceCollision = (p1loc == wking || p2loc == wking || p1loc == p2loc);
        var tooManyPiecesOnKing = (p1loc == bking && p2loc == bking);

        if ( kingsTooClose || whitePieceCollision || tooManyPiecesOnKing )
        {
            prcSet( BLACK, posx, ILLEGAL );
            prcSet( WHITE, posx, ILLEGAL );
            continue;
        }

        // For BTM, if either white piece on black king then we are at DEATH.
        if ( p1loc == bking || p2loc == bking)
            prcSet( BLACK, posx, DEATH  );

        // Black is in check if either white piece can capture king on the move. This represents DEATH in one move for white.
        var inCheck = false;

        // Look for in check
        var numMoves = getAllMoves( WHITE, posx, true/*skipKing*/, movesArray );
        for ( var ix = 0; ix < numMoves && !inCheck; ix++ )
        {
            var m1loc = piece1Loc( movesArray[ix] );
            var m2loc = piece2Loc( movesArray[ix] );
            if ( (m1loc == bking && m1loc != p1loc) || (m2loc == bking && m2loc != p2loc) )
            {
                prcSet( WHITE, posx, DEATH+1 );
                inCheck = true;
            }
        }

        // If black king on either white piece but not death-in-1 for white, then black king has captured and cannot be immediately recaptured -> DRAW
        if ( !inCheck && (p1loc == bking || p2loc == bking ))
            prcSet( WHITE, posx, DRAW );
    }
}

// scan all moves looking for death in X
function findDeathInX( onMove, posx, inX )
{
    var found = false;
    if ( onMove == WHITE )
    {
        // It may be that all white moves from this position lead to draws. We assume that is the case
        // and mark draw=false when any non-draw move is discovered (included UNRESOLVED).
        var draw  = true;

        // Look at results from all possible moves
        var numMoves = getAllMoves( onMove, posx, false/*doKing*/, movesArray );
        for ( var ix = 0; ix < numMoves; ix++ )
        {
            var val = prcLookup( BLACK, movesArray[ ix ]);
            if ( val == inX )
                return prcSet( WHITE, posx, val+1 );
            else if ( val == UNRESOLVED || val <= MAX_MOVES_TO_MATE )
                draw = false;
        }

        if ( draw )
            found = prcSet( WHITE, posx, DRAW );
    }
    else /* onMove == BLACK */
    {
        var bestMove = -1;

        // Try all possible king moves.
        numMoves = getAllMoves( onMove, posx, false/*doKing*/, movesArray );
        for ( ix = 0; ix < numMoves; ix++ )
        {
            var result = prcLookup( WHITE, movesArray[ ix ]);
            if ( result == DRAW )
                return prcSet( BLACK, posx, DRAW );
            else if ( result != ILLEGAL )
                bestMove = Math.max( bestMove, result );
        }

        // Special case check for stalemate. If black is one move from death but not in check, then stalemate.
        if ( bestMove == DEATH+1 && prcLookup( WHITE, posx ) != DEATH+1 )
            found = prcSet( BLACK, posx, DRAW );
        else if ( bestMove == inX )
            found = prcSet( BLACK, posx, bestMove );
    }
    return found;
}


function resolveBatch( onMove, moves, batchNo )
{
    var found = false;

    // We have seeded cache with death (btm, prc=0), and death on the move (wtm, prc=1).
    var startPosx = batchNo * (PRC_SIZE / NUM_THREADS);
    var endPosx   = startPosx + (PRC_SIZE / NUM_THREADS);

    for ( var posx = startPosx; posx < endPosx; posx++ )
        if ( prcLookup( onMove, posx ) == UNRESOLVED )
            if ( findDeathInX( onMove, posx, moves ) )
                found = true;

    return found;
}

function resolveAllPositions()
{
    var found = true;

    for ( var moves = 1; moves <= MAX_MOVES_TO_MATE && found; moves++ )
        for ( var onMove = BLACK; onMove <= WHITE; onMove++ )
        {
            found = resolveBatch( onMove, moves, 0 );
            if ( onMove == BLACK )
                console.log( moves );
        }
}


// Global Variables holding present piece positions
var wking_loc = 60;
var bking_loc = 36;
var p1_loc = 59;
var p2_loc = null;

function analyzeChessEndings()
{
    console.log( "Chess Endgame:\n\n" );

    seedCache();
    resolveAllPositions();
    printResults();

    // Generate new random hand
    var posx;
    var numMoves;
    do
    {
        bking_loc = Math.floor( Math.random()*64 );
        wking_loc = Math.floor( Math.random()*64 );
        p1_loc = Math.floor( Math.random()*64 );
        p2_loc = Math.floor( Math.random()*64 );
        posx = getPosx( bking_loc, wking_loc, p1_loc, p2_loc );
        numMoves = prcLookup( WHITE, posx );
    }
    while ( numMoves < 2 || numMoves >= MAX_MOVES_TO_MATE );

    // Print initial position
    printBoard( WHITE, posx, false );

    // Loop showing moves to reach mate
    while ( numMoves > MATE )
    {
        posx = printBoard( WHITE, posx, true );

        posx = printBoard( BLACK, posx, true );
        numMoves = prcLookup( WHITE, posx );
    }
}


// Main init function for the page
function init()
{
    if ( ENDGAME_TYPE === "QUEEN" ) { piece1 = queenType; piece2 = null; }
    else if ( ENDGAME_TYPE === "BISHOP_BISHOP" ) { piece1 = bishopType; piece2 = bishopType; }
    else if ( ENDGAME_TYPE === "BISHOP_KNIGHT" ) { piece1 = bishopType; piece2 = knightType; }
    else { piece1 = rookType; piece2 = null; }

    if ( !SKIP_ANALYSIS )
        analyzeChessEndings();

    var fileBuf = new Buffer( prc, 'binary' );
    fs.writeFileSync( 'twoBishops.dat', fileBuf, 'binary' );
    console.log( 'output file written' );
}

init();
