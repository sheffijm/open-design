// Command launcher is the Open Design fossil launcher: one binary that runs as
// the L0 stub (baked bundle copy, hop 0) or the L1 authority (delegated payload
// copy, hop 1). It is network-free and sits at the OS bundle-executable slot,
// handing off to / launching the Electron payload.
package main

import (
	"os"

	"github.com/nexu-io/open-design/launcher/internal/app"
)

func main() {
	os.Exit(app.Run(os.Args))
}
