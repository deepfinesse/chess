// Copyright 2014, William Bailey, Deep Finesse Inc.
//
// All rights reserved. Use of this source code is governed by
// a BSD-style license that can be found in the LICENSE file.
//
// Implements WEB service supplying solutions to chess endgame positions
// involving lone Queen or Rook, two Bishops, and Bishop & Knight.
//

// +build !appengine

package main

import (
	"fmt"
	"net/http"
)

func main() {
	fmt.Println("Bill's Chess Server - Running at http://localhost:8080")

	err := http.ListenAndServe("localhost:8080", nil)
	if err != nil {
		fmt.Printf("listenAndServer err=%v\n", err)
	}
}
