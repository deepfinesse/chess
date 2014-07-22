// Copyright 2014, William Bailey, Deep Finesse Inc.
//
// All rights reserved. Use of this source code is governed by
// a BSD-style license that can be found in the LICENSE file.
//
// Implements WEB service supplying solutions to chess endgame positions
// involving lone Queen or Rook, two Bishops, and Bishop & Knight.
//
package main

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
)

// Basic constants. The position result cache (PRC) stores moves-to-mate for
// every possible position. These values range from 1-33 (or so). So constants
// below are chosen to fit in uint8 and not conflict.
const DRAW = 127
const UNRESOLVED = 126
const ILLEGAL = 125
const MATE = 1
const DEATH = 0
const NUM_SQUARES = 64       // upper left 0, lower right 63
const MAX_MOVES_TO_MATE = 50 // in practice 33 is tops but laws allow 50

// Struct and literals describing different piece types and their characteristics
type pieceType struct {
	numMovements int
	anyMoveLen   bool
	movements    []int // eg -9 means can move to square one row up and one col left
}

var knightType = &pieceType{8, false, []int{-17, -15, -10, -6, 6, 10, 15, 17}}
var bishopType = &pieceType{4, true, []int{-9, -7, 7, 9}}
var wKingType = &pieceType{8, false, []int{-9, -8, -7, -1, 1, 7, 8, 9}}
var bKingType = &pieceType{8, false, []int{-9, -8, -7, -1, 1, 7, 8, 9}}
var queenType = &pieceType{8, true, []int{-9, -8, -7, -1, 1, 7, 8, 9}}
var rookType = &pieceType{4, true, []int{-1, 1, -8, 8}}

// For now, hard wire to this endgame type
var p1Type = rookType //bishopType
var p2Type *pieceType //= knightType

// Position Result Caches: read from pre-generated file on disk
var prcq []byte // Queen endgame
var prcr []byte // Rook endgame
var prck []byte // Knight/Bishop endgame
var prcb []byte // Bishop/Bishop endgame
var prc []byte  // dynamically set to one of above based on "t=" param

// Return x,y grid value for a piece location (0-63)
func xloc(pieceLoc int) int { return pieceLoc % 8 }
func yloc(pieceLoc int) int { return pieceLoc >> 3 }

// board position gloms together 4 piece locations in 24 total bits
// plus one bit for side on-move: 2^25 = 32M locations
func getPosx(bking, wking, p1loc, p2loc int) int {
	if p2Type != nil {
		return ((p2loc*NUM_SQUARES+p1loc)*NUM_SQUARES+wking)*NUM_SQUARES + bking
	}
	return (p1loc*NUM_SQUARES+wking)*NUM_SQUARES + bking
}

// Get piece location from board position
func bkingLoc(posx int) int  { return (posx >> 0) & 0x3f }
func wkingLoc(posx int) int  { return (posx >> 6) & 0x3f }
func piece1Loc(posx int) int { return (posx >> 12) & 0x3f }
func piece2Loc(posx int) int {
	if p2Type != nil {
		return (posx >> 18) & 0x3f
	}
	return -1
}
func getOnMoveBit(whiteOnMove bool) int {
	bit := 0
	if whiteOnMove {
		bit = 1
	}
	if p2Type != nil {
		return bit << 24
	}
	return bit << 18
}
func getWhiteOnMove(posx int) bool {
	if p2Type != nil {
		return ((posx >> 24) & 1) == 1
	}
	return ((posx >> 18) & 1) == 1
}

// Returns true so long as prev & next locations did not wrap to other side of board
func noWrap(prev, next int) bool {
	diff := xloc(prev) - xloc(next)
	if diff < 0 {
		return (-diff) <= 2
	}
	return diff <= 2
}

// Given a pieceType and the current position, return an array of position
// indexes that result from all possible moves of the piece
func getPieceMoves(piece *pieceType, posx int, moves []int) []int {
	bking := bkingLoc(posx)
	wking := wkingLoc(posx)
	p1loc := piece1Loc(posx)
	p2loc := piece2Loc(posx)

	var me, other int
	switch piece {
	case bKingType:
		me = bking
	case wKingType:
		me = wking
	case p1Type:
		me = p1loc
	default:
		me = p2loc
	}
	if piece == bKingType || piece == wKingType || p2Type == nil {
		other = -1
	} else if piece == p1Type {
		other = p2loc
	} else {
		other = p1loc
	}

	for ix := 0; ix < piece.numMovements; ix++ {
		bump := (-NUM_SQUARES)
		if piece.anyMoveLen {
			bump = piece.movements[ix]
		}
		for prev, next := me, me+piece.movements[ix]; next >= 0 && next < NUM_SQUARES &&
			next != wking && (next != other || next == bking) && noWrap(prev, next); next += bump {
			var newPosx int
			switch piece {
			case bKingType:
				newPosx = getPosx(next, wking, p1loc, p2loc)
			case wKingType:
				newPosx = getPosx(bking, next, p1loc, p2loc)
			case p1Type:
				newPosx = getPosx(bking, wking, next, p2loc)
			case p2Type:
				newPosx = getPosx(bking, wking, p1loc, next)
			}
			moves = append(moves, newPosx)
			if next == bking {
				break
			}
			prev = next
		}
	}
	return moves
}

// Build list of all legal moves for all pieces
func getAllMoves(posx int, whiteOnMove, skipKing bool, moves []int) []int {
	if !skipKing {
		if whiteOnMove {
			moves = getPieceMoves(wKingType, posx, moves)
		} else {
			moves = getPieceMoves(bKingType, posx, moves)
		}
	}
	if whiteOnMove {
		moves = getPieceMoves(p1Type, posx, moves)
		if p2Type != nil {
			moves = getPieceMoves(p2Type, posx, moves)
		}
	}
	return moves
}

// Lookup results in PRC for each possible move, store in map for conversion to JSON
func getResults(posx int) map[string]byte {
	whiteOnMove := getWhiteOnMove(posx)
	moves := make([]int, 0, NUM_SQUARES)
	results := make(map[string]byte, NUM_SQUARES)

	moves = getAllMoves(posx, whiteOnMove, false /*doKing*/, moves)

	for ix := range moves {
		result := prc[moves[ix]+getOnMoveBit(!whiteOnMove)]
		fmt.Printf("move to %d = %d\n", moves[ix], result)
		results[strconv.Itoa(moves[ix])] = result
	}
	fmt.Println(results)
	return results
}

func myHttpServe(w http.ResponseWriter, r *http.Request) {
	gameType := r.FormValue("type")
	fmt.Println("Received type=", gameType)
	switch gameType {
	case "q":
		prc = prcq
		p1Type = queenType
		p2Type = nil
	case "r":
		prc = prcr
		p1Type = rookType
		p2Type = nil
	case "b":
		prc = prcb
		p1Type = bishopType
		p2Type = bishopType
	case "k":
		prc = prck
		p1Type = bishopType
		p2Type = knightType
	}

	urlPosx := r.FormValue("posx")
	posx, _ := strconv.Atoi(urlPosx)
	fmt.Println("Received posx=", posx)

	results := getResults(posx)
	jsonBytes, err := json.Marshal(results)
	if err != nil {
		fmt.Println("json err=", err)
	}
	fmt.Printf("JSON=%v\n", string(jsonBytes))

	w.Header().Set("Content-Type", "text/plain")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	len, err := w.Write(jsonBytes)
	if err != nil {
		log.Fatal("json response write failed", err, len)
	}
}

// Init func reads position result cache into memory from pre-generated file
func init() {
	r, err := zip.OpenReader("endGameData.zip")
	if err != nil {
		log.Fatal(err)
	}
	defer r.Close()

	for _, f := range r.File {
		fmt.Printf("Found %s in ZIP file\n", f.Name)
		rc, err := f.Open()
		if err != nil {
			log.Fatal(err)
		}
		defer rc.Close()

		var b = new(bytes.Buffer)
		byteSize, err := io.Copy(b, rc)
		fmt.Printf("uncompressed %d bytes from %s\n", byteSize, f.Name)

		switch f.Name {
		case "bishopKnight.dat":
			prck = b.Bytes()
		case "queen.dat":
			prcq = b.Bytes()
		case "rook.dat":
			prcr = b.Bytes()
		case "bishopBishop.dat":
			prcb = b.Bytes()
		}
		prc = b.Bytes()
	}
	http.HandleFunc("/", myHttpServe)
}
