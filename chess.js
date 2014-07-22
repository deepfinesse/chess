
// Arrow colors
var GREEN  = "#009100"
//var YELLOW = "#D8CF03"
var YELLOW = "#c1c100"
var RED    = "#C10000"

// Arrow locations
var arrowTop  = [65,  59,  62, 108, 150, 151, 146, 108];
var arrowLeft = [68, 115, 155,  64, 153, 115,  66, 157];

var knightArrowTop  = [97,  62,  59,  93, 117, 152, 149, 115];
var knightArrowLeft = [64, 101, 123, 157, 155, 119, 100,  65];

// Piece Types are set by init() based on endgame type
var p1Type;
var p2Type;

// Global Variables holding present piece locations (0-63)
var wking_loc;
var bking_loc;
var p1_loc;
var p2_loc;

var backPos = [];
var backPosx = -1;

// Translate posx results from server to board locations
function getWhiteMoves( curPosx, results, board/*outParam*/, board1, board2, board3 )
{
    var best    = UNRESOLVED;
    var best2   = UNRESOLVED;

    var curKing = wkingLoc( curPosx );
    var curP1   = piece1Loc( curPosx );
    var curP2   = piece2Loc( curPosx );

    for ( var newPosx in results )
    {
        var newKing = wkingLoc( newPosx );
        var newP1   = piece1Loc( newPosx );
        var newP2   = piece2Loc( newPosx );
        var result  = results[ newPosx ];

        if ( newKing != curKing ) {
            board1[ newKing ] = result;
            if (result < board[ newKing ] || (board[ newKing ] == UNRESOLVED && result == DRAW ))
                board[ newKing ] = result;
        }

        if ( newP1 != curP1 ) {
            board2[ newP1 ] = result;
            if (result < board[ newP1 ] || (board[ newP1 ] == UNRESOLVED && result == DRAW ))
                board[ newP1 ] = result;
        }

        if ( p2Type != null && newP2 != curP2 ) {
            board3[ newP2 ] = result;
            if (result < board[ newP2 ] || (board[ newP2 ] == UNRESOLVED && result == DRAW ))
                board[ newP2 ] = result;
        }
        if ( result >= 0 && result < best ) {
            best2 = best;
            best = result;
        } else if ( result >= 0 && result < best2 && result != best)
            best2 = result;
    }
    return { top: best - 1, second: best2 - 1 };
}

function getBlackMoves( curPosx, results, board/*outParam*/ )
{
    var best    = -1;
    var best2   = -1;
    var curKing = bkingLoc( curPosx )

    // Try all possible king moves.
    for ( var newPosx in results )
    {
        var newKing = bkingLoc( newPosx );
        var result  = results[ newPosx ];

        if ( result > MATE )
        {
            board[ newKing ] = result;

            if ( result > best && result < MAX_MOVES_TO_MATE ) {
                best2 = best;
                best = result;
            } else if ( result > best2 && result != best && result < MAX_MOVES_TO_MATE )
                best2 = result;
        }
    }
    return { top: best - 1, second: best2 - 1 };
}

function getArrowColor( onMove, result, bests, curColor )
{
    if ( curColor == GREEN || result == bests.top )
        return GREEN;

    if ( curColor == YELLOW || result == bests.second  )
        return YELLOW;

    return RED;
}

function getArrowColors( curLoc, results, bests, colors/*outParam*/ )
{
    for ( var newPosx in results )
    {
        var newLoc;
        onMove = WHITE;
        switch( curLoc ) {
            case bking_loc: newLoc = bkingLoc( newPosx ); onMove = BLACK; break;
            case wking_loc: newLoc = wkingLoc( newPosx ); break;
            case p1_loc: newLoc = piece1Loc( newPosx ); break;
            default: newLoc = piece2Loc( newPosx );
        }
        if ( newLoc != curLoc ) {
            var result = ( results[ newPosx ] <= MAX_MOVES_TO_MATE ? results[ newPosx ] - 1 : -1 );

            //console.log("c="+curLoc+" n="+newLoc+" result="+result);

            if (result > 0 || result == 0 && onMove == WHITE) {
                if (curLoc > newLoc) {
                    var diff = curLoc - newLoc;

                    if (diff % 9 == 0 || diff == 10)
                        colors[0] = getArrowColor(onMove, result, bests, colors[0]);
                    else if (diff % 8 == 0 || diff == 17)
                        colors[1] = getArrowColor(onMove, result, bests, colors[1]);
                    else if (diff % 7 == 0 && yloc(curLoc) != yloc(newLoc) || diff == 15)
                        colors[2] = getArrowColor(onMove, result, bests, colors[2]);
                    else
                        colors[3] = getArrowColor(onMove, result, bests, colors[3]);
                }
                else {
                    var diff = newLoc - curLoc;
                    if (diff % 9 == 0 || diff == 10)
                        colors[4] = getArrowColor(onMove, result, bests, colors[4]);
                    else if (diff % 8 == 0 || diff == 17)
                        colors[5] = getArrowColor(onMove, result, bests, colors[5]);
                    else if (diff % 7 == 0 && yloc(curLoc) != yloc(newLoc) || diff == 15)
                        colors[6] = getArrowColor(onMove, result, bests, colors[6]);
                    else
                        colors[7] = getArrowColor(onMove, result, bests, colors[7]);
                }
            }
        }
    }
}

function moveArrows( tag, curLoc, arrowColors )
{
    var knight = (p2Type != null && curLoc == p2_loc);
    var topSet = (knight ? knightArrowTop : arrowTop);
    var leftSet = (knight ? knightArrowLeft : arrowLeft);

    for ( var ix = 0; ix < 8; ix++ ) {
        var id = "#" + tag + ix;
        if ( arrowColors[ix] != "" && (curLoc == bking_loc || p2Type == null || arrowColors[ix] != RED)) {
            var top = topSet[ix] + (yloc(curLoc) - 1) * 80;
            var left = leftSet[ix] + (xloc(curLoc) - 1) * 80;

            $(id).css('top', top).css('left', left).css('color', arrowColors[ix]).show();
        }
        else {
            $(id).hide();
        }
        if (curLoc == bking_loc) {
            $( "#p1a" + ix ).hide();
            $( "#p2a" + ix ).hide();
        }
    }
}

// Draw pieces on board and label squares with moves-to-mate
function uiPopulateBoard( onMove, resultsFromServer )
{
    function locToSquare( loc ) { return String.fromCharCode( (loc & 0x7) + 65/*A*/) + (8 - (loc >> 3));}

    var board = new Array( NUM_SQUARES );
    var board1 = new Array( NUM_SQUARES );
    var board2 = new Array( NUM_SQUARES );
    var board3 = new Array( NUM_SQUARES );
    for ( var ix = 0; ix < NUM_SQUARES; ix++ )
        board[ ix ] = board1[ ix ] = board2[ ix ] = board3[ix] = UNRESOLVED;

    var arrowColors = new Array( NUM_SQUARES );
    for ( var ix = 0; ix < NUM_SQUARES; ix++ )
        arrowColors[ ix ] = "";

    var bests;
    if ( resultsFromServer )
    {
        var curPosx = getPosx( bking_loc, wking_loc, p1_loc, p2_loc );
        if ( onMove == BLACK ) {
            bests = getBlackMoves(curPosx, resultsFromServer, board);
            getArrowColors( bking_loc, resultsFromServer, bests, arrowColors );
            moveArrows( "ka", bking_loc, arrowColors );
        }
        else {
            bests = getWhiteMoves(curPosx, resultsFromServer, board, board1, board2, board3 );
            for ( var ix = 0; ix < 8; ix++ )
                $( "#ka" + ix ).hide();
            /*
            getArrowColors( wking_loc, resultsFromServer, bests, arrowColors );
            moveArrows( "ka", wking_loc, arrowColors );

            for ( var ix = 0; ix < NUM_SQUARES; ix++ )
                arrowColors[ ix ] = "";
            getArrowColors( p1_loc, resultsFromServer, bests, arrowColors );
            moveArrows( "p1a", p1_loc, arrowColors );

            if ( p2Type != null )
            {
                for ( var ix = 0; ix < NUM_SQUARES; ix++ )
                    arrowColors[ ix ] = "";
                getArrowColors( p2_loc, resultsFromServer, bests, arrowColors );
                moveArrows( "p2a", p2_loc, arrowColors );
            }
            */
        }
    }

    for ( var loc = 0; loc < NUM_SQUARES; loc++ )
    {
        var square = '#' + locToSquare( loc );
        var result = ( board[ loc ] <= MAX_MOVES_TO_MATE ? board[ loc ] - 1 : -1 );
        var r1 = ( board1[ loc ] <= MAX_MOVES_TO_MATE ? board1[ loc ] - 1 : -1 );
        var r2 = ( board2[ loc ] <= MAX_MOVES_TO_MATE ? board2[ loc ] - 1 : -1 );
        var r3 = ( board3[ loc ] <= MAX_MOVES_TO_MATE ? board3[ loc ] - 1 : -1 );

        if ( loc == bking_loc )
            $(square).html('<span id="bk" class="piece">&#'+bKingType.unicodeChar+';</span>');
        else if ( loc == wking_loc )
            $( square ).html( '<span id="wk" class="piece">&#'+wKingType.unicodeChar+';</span>' );
        else if ( loc == p1_loc )
            $( square ).html( '<span id="wb" class="piece">&#'+p1Type.unicodeChar+';</span>' );
        else if ( p2Type != null && loc == p2_loc )
            $( square ).html( '<span id="wn" class="piece">&#'+p2Type.unicodeChar+';</span>' );
        else if ( result == 0 ) {
            var pieceNum = ( r2 == 0 ) ? 2 : 3;
            var id = "mp" + pieceNum + "loc" + loc;
            $(square).html("<span id='" + id + "' style='color:" + GREEN + ";'>mate!</span>");

            // make target "mate!" text click-able to move piece there
            $( "#" + id ).one( "click", {piece: pieceNum, loc:loc}, function (event) {
                uiHandleClickEvent( event );
            });
            $( "#" + id ).hover(
                function () { $( this).css( "font-size", "26px" ); },
                function () { $( this).css( "font-size", "16px" ); }
            );
        }
        else if ( result == DRAW )
            $( square ).html( "<span>draw</span>" );
        else if ( result > 0 )
        {
            var rColor = getArrowColor( onMove, result, bests, "" );
            if (onMove == BLACK)
            {
                var id1 = "mp0loc" + loc;

                // Dynamically add moves-to-mate number to target square HTML
                $(square).html("<span id='" + id1 + "' style='color:" + rColor + ";font-weight: bold; font-size: 16px'>&nbsp;&nbsp;" + result + "&nbsp;&nbsp;</b></span>");

                // make target number click-able to move piece there
                $( "#" + id1 ).one( "click", {piece: 0, loc:loc},
                    function (event) { uiHandleClickEvent( event ); }
                );
                $( "#" + id1 ).hover(
                    function () { $( this).css( "font-size", "26px" ); },
                    function () { $( this).css( "font-size", "16px" ); }
                );
            }
            else {
                var c1 = getArrowColor( WHITE, r1, bests, "" );
                var c2 = getArrowColor( WHITE, r2, bests, "" );
                var c3 = getArrowColor( WHITE, r3, bests, "" );

                var id1 = "mp1loc" + loc;
                var id2 = "mp2loc" + loc;
                var id3 = "mp3loc" + loc;

                var sqHtml = "";
                if ( r1 > 0 )
                    sqHtml += "<span id='" + id1 + "' class='miniPiece' style='color:" + c1 + "'>&#" + wKingType.unicodeChar + "</b></span>";
                if ( r2 > 0 )
                    sqHtml += "<span id='" + id2 + "' class='miniPiece' style='color:" + c2 + "'>&#" + p1Type.unicodeChar + "</b></span>";
                if ( r3 > 0 )
                    sqHtml += "<span id='" + id3 + "' class='miniPiece' style='color:" + c3 + "'>&#" + p2Type.unicodeChar + "</b></span>";

                // Dynamically add mini piece to target square HTML
                $( square ).html( sqHtml );

                // make miniPiece click-able to move actual piece there
                if ( r1 > 0 ) {
                    $( "#" + id1 ).one( "click", {piece: 1, loc:loc},
                        function (event) { uiHandleClickEvent(event ); }
                    );
                    $( "#" + id1 ).hover(
                        function () { $( this).css( "font-size", "42px" ); },
                        function () { $( this).css( "font-size", "30px" ); }
                    );
                }
                if ( r2 > 0 ) {
                    $( "#" + id2 ).one( "click", {piece: 2, loc:loc},
                        function (event) { uiHandleClickEvent(event ); }
                    );
                    $( "#" + id2 ).hover(
                        function () { $( this).css( "font-size", "42px" ); },
                        function () { $( this).css( "font-size", "30px" ); }
                    );
                }
                if ( r3 > 0 ) {
                    $( "#" + id3 ).one( "click", {piece: 3, loc:loc},
                        function (event) { uiHandleClickEvent(event ); }
                    );
                    $( "#" + id3 ).hover(
                        function () { $( this).css( "font-size", "42px" ); },
                        function () { $( this).css( "font-size", "30px" ); }
                    );
                }
            }
        }
        else
            $( square ).html( '' );
    }
    // reset draggable of chess pieces
    $( '.piece' ).draggable({ containment: '#chess_board', stack: '.piece' });
}

function callServerForResults( onMove, posx )
{
    var request = new XMLHttpRequest();
    //var url = "http://localhost:8080/getChessData?posx=" + posx + "&type=" + gameType;
    var url = "http://deep-finesse.appspot.com/getChessData?posx=" + posx + "&type=" + gameType;
    console.log( "url=" + url );
    request.open( "GET", url );
    request.onreadystatechange = function()
    {
        if ( request.readyState === 4 && request.status === 200 )
        {
            var type = request.getResponseHeader( "Content-Type" );
            var resultsFromServer = JSON.parse( request.responseText );

            uiPopulateBoard( onMove, resultsFromServer );
        }
    }
    request.send();
}

// an actual piece got dragged and dropped to some square; handle it.
function uiHandleDropEvent( event, ui )
{
    function squareToLoc( square ) { return (56 - square.charCodeAt( 1 )) * 8 + (square.charCodeAt( 0 ) - 65/*A*/);}

    var pieceDropped = ui.draggable.attr( 'id' );
    var droppedOn    = $(this).attr( 'id' );

    ui.draggable.position( { of: $(this), my: 'left top', at: 'left top' } );

    var loc     = squareToLoc( droppedOn );
    var onMove  = BLACK;
    var changed = true;
    if ( pieceDropped == "bk" )
    {
        changed = ( loc != bking_loc );
        onMove = WHITE;
        bking_loc = loc;
    }
    else if ( pieceDropped == "wk" )
    {
        changed = ( loc != wking_loc );
        wking_loc = loc;
    }
    else if ( pieceDropped == "wb" )
    {
        changed = ( loc != p1_loc );
        p1_loc = loc;
    }
    else
    {
        changed = ( loc != p2_loc );
        p2_loc = loc;
    }

    if ( changed )
    {
        var posx = getPosx( bking_loc, wking_loc, p1_loc, p2_loc ) + getOnMoveBit( onMove );
        backPos[ ++backPosx ] = posx;
        callServerForResults( onMove, posx );
    }
}

// Move actual piece to target area containing mini piece (or moves-to-mate #)
function uiHandleClickEvent( event )
{
    if ( event.data.piece == 0 ) {
        onMove = WHITE;
        bking_loc = event.data.loc;
    }
    else if ( event.data.piece == 1 ) {
        onMove = BLACK;
        wking_loc = event.data.loc;
    }
    else if ( event.data.piece == 2 ) {
        onMove = BLACK;
        p1_loc = event.data.loc;
    }
    else if ( event.data.piece == 3 ) {
        onMove = BLACK;
        p2_loc = event.data.loc;
    }
    var posx = getPosx( bking_loc, wking_loc, p1_loc, p2_loc ) + getOnMoveBit( onMove );
    backPos[ ++backPosx ] = posx;
    callServerForResults( onMove, posx );
}

function doRandomBoard()
{
    // Generate new random hand
    do
    {
        bking_loc = Math.floor( Math.random()*64 );
        wking_loc = Math.floor( Math.random()*64 );
        p1_loc = Math.floor( Math.random()*64 );
        p2_loc = Math.floor( Math.random()*64 );
    }
    while ( bking_loc == wking_loc || bking_loc == p1_loc || bking_loc == p2_loc ||
        wking_loc == p1_loc || wking_loc == p2_loc || p1_loc == p2_loc ||
        xloc( bking_loc ) == 0 ||
        xloc( bking_loc ) == 7 ||
        yloc( bking_loc ) == 0 ||
        yloc( bking_loc ) == 7 ||
        Math.abs( bking_loc - wking_loc ) <= 10 ||
        Math.abs( bking_loc - p1_loc ) <= 10 ||
        Math.abs( bking_loc - p2_loc ) <= 10
        );

    var posx = getPosx( bking_loc, wking_loc, p1_loc, p2_loc ) + getOnMoveBit( BLACK );
    backPos[ ++backPosx ] = posx;
    callServerForResults( BLACK, posx );
}

var gameType = "r";

// Main init function for the page
function init()
{
    console.log( "Chess Endgame:\n\n" );

    p1Type = rookType; p2Type = null; gameType = "r"

    $('.square').droppable( {
        drop: uiHandleDropEvent,
        accept: '.piece'
    } );

    $(function() {
        $( "#queenbut" ).button().click( function( event ) {
            event.preventDefault();
            console.log( "queen" );
            p1Type = queenType; p2Type = null; gameType = "q"; backPosx = 0;
            doRandomBoard();
            });
    });

    $(function() {
        $( "#rookbut" ).button().click( function( event ) {
            event.preventDefault();
            console.log( "rook" );
            p1Type = rookType; p2Type = null; gameType = "r"; backPosx = 0;
            doRandomBoard();
        });
    });

    $(function() {
        $( "#knightbut" ).button().click( function( event ) {
            event.preventDefault();
            console.log( "knight" );
            p1Type = bishopType; p2Type = knightType; gameType = "k"; backPosx = 0;
            doRandomBoard();
        });
    });

    $(function() {
        $( "#backbut" ).button().click( function( event ) {
            event.preventDefault();
            console.log( "BACK" );
            if ( backPosx > 0 ) {
                var posx = backPos[ --backPosx ];
                bking_loc = bkingLoc(posx);
                wking_loc = wkingLoc(posx);
                p1_loc = piece1Loc(posx);
                p2_loc = piece2Loc(posx);
                callServerForResults( getOnMove(posx), posx );
            }
        });
    });

    $(function() {
        $( "#switchbut" ).button().click( function( event ) {
            event.preventDefault();
            console.log( "SWITCH" );
            var posx = backPos[ backPosx ];
            posx = switchOnMove( posx );
            backPos[ backPosx ] = posx;
            callServerForResults( getOnMove(posx), posx );
        });
    });

    doRandomBoard();
}


// jQuery call to kick off our init function once the page loads enough to be ready
$(document).ready( init );
