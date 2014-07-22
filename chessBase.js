
//
// BASIC CHESS HEADER
//

var BLACK       = 0;
var WHITE       = 1;
var NUM_PLYRS   = 2;
var NUM_SQUARES = 64;

// special position cache result values
var DRAW			    = 127;
var UNRESOLVED		    = 126;
var ILLEGAL			    = 125;   // eg. kings adjacent to each other, white rook on white king, etc
var MAX_MOVES_TO_MATE   = 50;    // defined by uschess.org
var MATE			    = 1;     // One move left to death
var DEATH			    = 0;     // Black king is captured by white

// pieceLoc holds 0-63 representing square location.
function xloc( pieceLoc ) { return pieceLoc % 8;  }
function yloc( pieceLoc ) { return pieceLoc >> 3; }

// Constants used by PieceType object below
var ANY_MOVE_LENGTH     = 0;    // piece can move any length (eg. bishop, rook)
var ONE_MOVE_LENGTH     = 1;    // piece can move only one unit (eg. knight, king)

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
function getPosx( bking, wking, p1loc, p2loc )
{
    return (( (p2Type != null ? p2loc : 0) * NUM_SQUARES + p1loc) * NUM_SQUARES + wking) * NUM_SQUARES + bking;
}

// Get piece location from board position
function bkingLoc(  posx ) { return ( posx >>  0 ) & 0x3f; }
function wkingLoc(  posx ) { return ( posx >>  6 ) & 0x3f; }
function piece1Loc( posx ) { return ( posx >> 12 ) & 0x3f; }
function piece2Loc( posx ) { return p2Type != null ? ( posx >> 18 ) & 0x3f : -1; }
function getOnMoveBit( onMove ) { return p2Type != null ? onMove << 24 : onMove << 18; }
function getOnMove( posx ) { return posx >> (p2Type != null ? 24 : 18) & 1; }
function switchOnMove( posx )
{
    var bit = ( p2Type != null ) ? 0x1000000 : 0x40000;
    if ( posx & bit )
        return posx & (~bit);
    return posx | bit;
}


// Given a pieceType and the current position, return an array of position indexes that result from all possible moves of the piece
function getPieceMoves( piece, posx, moves, movex )
{
    var bking  = bkingLoc(  posx );
    var wking  = wkingLoc(  posx );
    var p1loc  = piece1Loc( posx );
    var p2loc  = piece2Loc( posx );

    var me    = ( piece == bKingType ? bking : piece == wKingType ? wking : piece == p1Type ? p1loc : p2loc );
    var other = ( piece == bKingType || piece == wKingType || p2Type == null ? -1 : piece == p1Type ? p2loc : p1loc );

    for ( var ix = 0; ix < piece.numMovements; ix++ )
    {
        var bump = (piece.moveLength == ANY_MOVE_LENGTH ? piece.movements[ ix ] : - NUM_SQUARES);
        for ( var prev = me, next = me + piece.movements[ ix ];
              next >= 0 && next < NUM_SQUARES && next != wking && (next != other || next == bking) && Math.abs( xloc(prev) - xloc(next) ) <= 2;
              prev = next, next += bump )
        {
            moves[ movex++ ] = getPosx( piece == bKingType ? next : bking,
                piece == wKingType ? next : wking,
                piece == p1Type    ? next : p1loc,
                piece == p2Type    ? next : p2loc );
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
        movex = getPieceMoves( p1Type, posx, moves, movex );
        if ( p2Type != null )
            movex = getPieceMoves( p2Type, posx, moves, movex );
    }
    return movex;
}


