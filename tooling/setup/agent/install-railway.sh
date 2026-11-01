#!/usr/bin/env bash
# Install the Railway CLI the deploy runs (.github/workflows/reusable-railway-deploy.yml), from its
# github.com release binary, pinned and SHA-256-verified.
#
# Why not `npm install -g @railway/cli`: that installed whatever version npm served that day, and
# its postinstall script downloads the binary unverified — in the deploy job, where every
# production secret was in reach (H-2). The npm package wraps this same release binary.
#
#     sudo bash tooling/setup/agent/install-railway.sh
#
# Version: RAILWAY_VERSION + RAILWAY_SHA256_LINUX_<ARCH> in tool-versions.sh (an environment
# variable of that name wins, a trial). Installs when missing, reinstalls when the installed
# version differs, and refuses a download whose SHA-256 does not match the pin.
#
# Fails (exit 1) when it cannot install the pin: the deploy that runs it cannot go on without
# the CLI. Diagnostics go to stderr.
set -uo pipefail

readonly DESTINATION="${RAILWAY_INSTALL_DIRECTORY:-/usr/local/bin}"

# shellcheck source=tool-install.lib.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tool-install.lib.sh"
railway_version="$(pinned_version RAILWAY_VERSION)"
current_version="$(installed_version railway --version)"

if [ "${current_version}" = "${railway_version}" ]; then
  echo "install-railway: railway ${current_version} is at the pin — nothing to install." >&2
  exit 0
fi
require_linux railway "${railway_version}" || exit 1
echo "install-railway: installing railway ${railway_version} (found: ${current_version:-none})…" >&2

# Railway's release assets name the architectures by their Rust target triples.
case "$(linux_architecture)" in
  arm64) asset_architecture="aarch64" checksum_key="RAILWAY_SHA256_LINUX_ARM64" ;;
  *) asset_architecture="x86_64" checksum_key="RAILWAY_SHA256_LINUX_X64" ;;
esac
railway_tarball="railway-v${railway_version}-${asset_architecture}-unknown-linux-musl.tar.gz"
railway_url="https://github.com/railwayapp/cli/releases/download/v${railway_version}/${railway_tarball}"
temporary_directory="$(mktemp -d)"
if download_verified "${railway_url}" "${temporary_directory}/${railway_tarball}" "$(pinned_version "${checksum_key}")" \
  && tar -xzf "${temporary_directory}/${railway_tarball}" -C "${temporary_directory}" railway 2>/dev/null \
  && install -m 0755 "${temporary_directory}/railway" "${DESTINATION}/railway"; then
  rm -rf "${temporary_directory}"
  echo "install-railway: installed $("${DESTINATION}/railway" --version 2>/dev/null) (SHA-256 verified)." >&2
  exit 0
fi
rm -rf "${temporary_directory}"
echo "install-railway: could not install railway ${railway_version} from ${railway_url}." >&2
exit 1
