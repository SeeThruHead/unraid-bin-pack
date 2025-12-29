#!/bin/bash
#
# Unraid Bin-Pack Installer
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/SeeThruHead/unraid-bin-pack/main/install.sh | bash
#

set -e

echo "Unraid Bin-Pack Docker Wrapper Setup"
echo "====================================="
echo ""

# Prompt for mount point
read -p "Mount point for Unraid disks [/mnt]: " MOUNT_POINT
MOUNT_POINT=${MOUNT_POINT:-/mnt}

# Prompt for config directory
read -p "Config directory for plan files [/mnt/user/appdata/unraid-bin-pack]: " CONFIG_DIR
CONFIG_DIR=${CONFIG_DIR:-/mnt/user/appdata/unraid-bin-pack}

# Prompt for Docker image tag
read -p "Docker image tag [latest]: " IMAGE_TAG
IMAGE_TAG=${IMAGE_TAG:-latest}

# Prompt for output location
read -p "Output script path [./unraid-bin-pack]: " OUTPUT_PATH
OUTPUT_PATH=${OUTPUT_PATH:-./unraid-bin-pack}

echo ""
echo "Generating wrapper script..."

# Generate wrapper script
cat > "$OUTPUT_PATH" << EOF
#!/bin/bash
#
# Unraid Bin-Pack Docker Wrapper
# Generated on $(date -Iseconds)
#
# Mount points:
#   - $MOUNT_POINT (Unraid disks)
#   - $CONFIG_DIR (config/plan files)
#
# Docker image: seethruhead/unraid-bin-pack:$IMAGE_TAG
#

docker run --rm -it \\
  -v "$MOUNT_POINT:$MOUNT_POINT" \\
  -v "$CONFIG_DIR:/config" \\
  seethruhead/unraid-bin-pack:$IMAGE_TAG "\$@"
EOF

# Make executable
chmod +x "$OUTPUT_PATH"

echo "✓ Wrapper script created: $OUTPUT_PATH"
echo ""
echo "Usage:"
echo "  $OUTPUT_PATH plan --help"
echo "  $OUTPUT_PATH plan --path-filter \"/Movies,/TV\""
echo "  $OUTPUT_PATH apply"
echo ""
echo "Mount points:"
echo "  Disks:  $MOUNT_POINT"
echo "  Config: $CONFIG_DIR"
echo ""
