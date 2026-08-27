#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu 22.04/24.04 ARM VM (Oracle Cloud Always Free "Ampere A1").
# Installs Docker Engine + compose plugin and opens the one public port the stack needs.
#
#   curl -fsSL https://raw.githubusercontent.com/BassilAlSafadi/Team1-Dell/main/deploy/vm-bootstrap.sh | bash
# or: scp this file over, then `bash vm-bootstrap.sh`
set -euo pipefail

echo ">> apt update + prerequisites"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git

echo ">> Docker apt repo"
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

echo ">> install Docker Engine + compose plugin"
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo ">> add $USER to docker group (log out/in for it to take effect)"
sudo usermod -aG docker "$USER"

echo ">> firewall: Oracle images ship with a restrictive iptables ruleset."
echo "   Allow HTTP/HTTPS (the tunnel needs outbound 7844; gateway is not published anyway,"
echo "   but open 80/443 in case you later switch to a named tunnel or direct exposure)."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT || true
sudo netfilter-persistent save || true

echo
echo ">> DONE. Log out and back in (so 'docker' works without sudo), then:"
echo "   git clone https://github.com/BassilAlSafadi/Team1-Dell.git"
echo "   cd Team1-Dell"
echo "   # put the 7 .env files in place (see deploy/README.md)"
echo "   bash deploy/up.sh"
