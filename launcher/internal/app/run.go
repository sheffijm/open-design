package app

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/nexu-io/open-design/launcher/internal/contract"
)

// RelocatedElectronName is the fixed filename the packaging afterPack hook gives
// the real Electron binary once the launcher takes its bundle-executable slot.
// The launcher execs its sibling of this name inside the same directory.
const RelocatedElectronName = "od-electron"

// Run is the launcher entrypoint. It currently lands the minimal robust form:
// spawn the relocated Electron sibling as a child (resident parent, so later
// increments can supervise it), forwarding argv + env unchanged — critically the
// after-quit tokens and the sidecar stamp. The L0 select/handoff and the L1
// authority (payload select, confirm/rollback, READY handshake) grow on top of
// this, each validated end-to-end via tools-pack + tools-serve.
func Run(argv []string) int {
	stamp := contract.ParseStamp(argv)
	_ = ModeForHop(stamp.Hop) // dispatch grows here as L0/L1 land

	target, err := siblingExecutable(RelocatedElectronName)
	if err != nil {
		return 1
	}
	return spawnAndWait(target, argv[1:])
}

// siblingExecutable resolves a file of the given name next to this binary.
func siblingExecutable(name string) (string, error) {
	self, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.Join(filepath.Dir(self), name), nil
}

// spawnAndWait runs bin as a child, wiring stdio and env through, and propagates
// its exit code. Spawn-not-exec keeps the launcher resident (Windows has no
// execve, and a resident parent is needed for later supervision/session-control).
func spawnAndWait(bin string, args []string) int {
	cmd := exec.Command(bin, args...)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	cmd.Env = os.Environ()
	if err := cmd.Run(); err != nil {
		var exit *exec.ExitError
		if errors.As(err, &exit) {
			return exit.ExitCode()
		}
		return 1
	}
	return 0
}
