/*
 * ptybridge - allocate a real pseudo-terminal and bridge it to stdio,
 * without depending on the *parent* process having a controlling terminal.
 *
 * webOS Homebrew's service jail runs headless (no /dev/tty for the Node
 * service), so tools like `script` that expect to inherit a controlling
 * terminal from their caller just hang forever instead of erroring. This
 * helper sidesteps that entirely: the CHILD explicitly acquires the PTY
 * slave as its own controlling terminal via setsid() + TIOCSCTTY, so no
 * terminal needs to exist anywhere upstream.
 *
 * Usage:
 *   ptybridge <cols> <rows> -- <command> [args...]
 *
 * Behavior:
 *   - fd 0/1/2 (stdin/stdout/stderr): raw byte-for-byte PTY session data,
 *     exactly like a normal spawned child would use them.
 *   - fd 3 (optional, only used if valid): resize channel. Writing a line
 *     "<cols>,<rows>\n" applies a new TIOCSWINSZ to the PTY. Not using
 *     fd 0/1/2 for this keeps the terminal data stream uncorrupted.
 *   - Exit code mirrors the child command's exit status (or 128+signal if
 *     it was killed by a signal), so callers can treat this like a normal
 *     spawned process.
 *
 * Statically linked against musl for portability across whatever libc a
 * given TV's firmware ships -- only plain POSIX APIs are used, no
 * webOS-specific headers or libraries.
 */

#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

#define RESIZE_FD 3
#define BUF_SIZE 4096

/* The child calls setsid(), becoming the leader of a brand new session --
 * so killing just the parent (ptybridge) process, as callers normally do to
 * close a session, would leave the shell (and anything it started) running
 * as an orphan forever. Forward termination signals to the child's whole
 * process group (negative pid) so closing a session actually ends it, the
 * same way a real terminal emulator exiting sends HUP to its foreground
 * process group. */
static volatile pid_t g_child_pid = -1;

static void forward_signal_and_exit (int sig) {
	(void) sig;

	if (g_child_pid > 0) {
		kill(-g_child_pid, SIGHUP);
		kill(-g_child_pid, SIGTERM);
	}

	_exit(0);
}

static int open_master (void) {
	int master = posix_openpt(O_RDWR | O_NOCTTY);

	if (master < 0) {
		perror("ptybridge: posix_openpt");
		return -1;
	}

	if (grantpt(master) != 0) {
		perror("ptybridge: grantpt");
		close(master);
		return -1;
	}

	if (unlockpt(master) != 0) {
		perror("ptybridge: unlockpt");
		close(master);
		return -1;
	}

	return master;
}

static void apply_winsize (int fd, int cols, int rows) {
	struct winsize ws;

	memset(&ws, 0, sizeof(ws));
	ws.ws_col = (unsigned short) cols;
	ws.ws_row = (unsigned short) rows;
	ioctl(fd, TIOCSWINSZ, &ws);
}

static void handle_resize_input (int master, char *buf, int len) {
	/* Expect "<cols>,<rows>\n"; ignore malformed input. */
	int cols = 0;
	int rows = 0;

	buf[len < BUF_SIZE ? len : BUF_SIZE - 1] = '\0';

	if (sscanf(buf, "%d,%d", &cols, &rows) == 2 && cols > 0 && rows > 0) {
		apply_winsize(master, cols, rows);
	}
}

static int relay_loop (int master, int resize_fd) {
	char buf[BUF_SIZE];
	int stdin_open = 1;
	int master_open = 1;

	for (;;) {
		struct pollfd fds[3];
		nfds_t nfds = 0;
		int idx_stdin = -1;
		int idx_master = -1;
		int idx_resize = -1;

		if (!master_open) {
			break;
		}

		fds[nfds].fd = master;
		fds[nfds].events = POLLIN;
		idx_master = (int) nfds;
		nfds++;

		if (stdin_open) {
			fds[nfds].fd = STDIN_FILENO;
			fds[nfds].events = POLLIN;
			idx_stdin = (int) nfds;
			nfds++;
		}

		if (resize_fd >= 0) {
			fds[nfds].fd = resize_fd;
			fds[nfds].events = POLLIN;
			idx_resize = (int) nfds;
			nfds++;
		}

		int rv = poll(fds, nfds, -1);

		if (rv < 0) {
			if (errno == EINTR) {
				continue;
			}
			perror("ptybridge: poll");
			break;
		}

		if (idx_master >= 0 && (fds[idx_master].revents & (POLLIN | POLLHUP | POLLERR))) {
			ssize_t n = read(master, buf, sizeof(buf));

			if (n > 0) {
				ssize_t written = 0;
				while (written < n) {
					ssize_t w = write(STDOUT_FILENO, buf + written, (size_t) (n - written));
					if (w < 0) {
						if (errno == EINTR) {
							continue;
						}
						break;
					}
					written += w;
				}
			} else {
				/* EOF or EIO -- the shell exited and closed the slave. */
				master_open = 0;
				continue;
			}
		}

		if (idx_stdin >= 0 && (fds[idx_stdin].revents & (POLLIN | POLLHUP | POLLERR))) {
			ssize_t n = read(STDIN_FILENO, buf, sizeof(buf));

			if (n > 0) {
				ssize_t written = 0;
				while (written < n) {
					ssize_t w = write(master, buf + written, (size_t) (n - written));
					if (w < 0) {
						if (errno == EINTR) {
							continue;
						}
						break;
					}
					written += w;
				}
			} else {
				/* Our stdin closed; stop polling it but keep relaying
				 * PTY output until the shell itself exits. */
				stdin_open = 0;
			}
		}

		if (idx_resize >= 0 && (fds[idx_resize].revents & (POLLIN | POLLHUP | POLLERR))) {
			ssize_t n = read(resize_fd, buf, sizeof(buf) - 1);

			if (n > 0) {
				handle_resize_input(master, buf, (int) n);
			} else {
				resize_fd = -1;
			}
		}
	}

	return 0;
}

int main (int argc, char *argv[]) {
	if (argc < 5) {
		fprintf(stderr, "usage: %s <cols> <rows> -- <command> [args...]\n", argv[0]);
		return 2;
	}

	int cols = atoi(argv[1]);
	int rows = atoi(argv[2]);

	if (strcmp(argv[3], "--") != 0) {
		fprintf(stderr, "ptybridge: expected '--' before command\n");
		return 2;
	}

	char **cmd = &argv[4];

	if (cols <= 0) {
		cols = 80;
	}
	if (rows <= 0) {
		rows = 24;
	}

	int master = open_master();

	if (master < 0) {
		return 1;
	}

	char *slave_name = ptsname(master);

	if (!slave_name) {
		perror("ptybridge: ptsname");
		close(master);
		return 1;
	}

	/* Duplicate the slave name before forking -- ptsname's static buffer
	 * could otherwise be clobbered by other libc calls in the child. */
	char slave_name_buf[256];
	strncpy(slave_name_buf, slave_name, sizeof(slave_name_buf) - 1);
	slave_name_buf[sizeof(slave_name_buf) - 1] = '\0';

	apply_winsize(master, cols, rows);

	signal(SIGPIPE, SIG_IGN);

	pid_t pid = fork();

	if (pid < 0) {
		perror("ptybridge: fork");
		close(master);
		return 1;
	}

	if (pid == 0) {
		/* Child: become session leader, acquire the PTY slave as our
		 * controlling terminal, wire it to fd 0/1/2, and exec. */
		close(master);

		if (setsid() < 0) {
			perror("ptybridge: setsid");
			_exit(1);
		}

		int slave = open(slave_name_buf, O_RDWR);

		if (slave < 0) {
			perror("ptybridge: open slave");
			_exit(1);
		}

#ifdef TIOCSCTTY
		if (ioctl(slave, TIOCSCTTY, 0) != 0) {
			perror("ptybridge: ioctl TIOCSCTTY");
			_exit(1);
		}
#endif

		dup2(slave, STDIN_FILENO);
		dup2(slave, STDOUT_FILENO);
		dup2(slave, STDERR_FILENO);

		if (slave > STDERR_FILENO) {
			close(slave);
		}

		/* The resize pipe (fd 3) is only meaningful to the parent. */
		close(RESIZE_FD);

		execvp(cmd[0], cmd);
		perror("ptybridge: execvp");
		_exit(127);
	}

	/* Parent: relay bytes between our own stdio and the PTY master, and
	 * apply resize requests arriving on fd 3 (if the caller provided one). */
	g_child_pid = pid;
	signal(SIGTERM, forward_signal_and_exit);
	signal(SIGHUP, forward_signal_and_exit);

	int resize_fd = -1;
	if (fcntl(RESIZE_FD, F_GETFD) != -1) {
		resize_fd = RESIZE_FD;
	}

	relay_loop(master, resize_fd);
	close(master);

	int status = 0;
	waitpid(pid, &status, 0);

	if (WIFEXITED(status)) {
		return WEXITSTATUS(status);
	}
	if (WIFSIGNALED(status)) {
		return 128 + WTERMSIG(status);
	}

	return 1;
}
