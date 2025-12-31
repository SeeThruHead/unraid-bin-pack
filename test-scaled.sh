#\!/bin/bash
# Simple test script for Unraid Bin Packer
# Fills disks to target percentages with random content

set -euo pipefail

LOG_DIR="/tmp/unraid-bin-pack-test"
mkdir -p "$LOG_DIR"
PLAN_LOG="$LOG_DIR/plan.log"

echo "========================================" | tee "$PLAN_LOG"
echo "Unraid Bin Pack Test - Auto-scaling" | tee -a "$PLAN_LOG"
echo "Started: $(date)" | tee -a "$PLAN_LOG"
echo "========================================" | tee -a "$PLAN_LOG"

# Clean up ALL disks first to prevent collisions
echo "" | tee -a "$PLAN_LOG"
echo "Cleaning up all disks..." | tee -a "$PLAN_LOG"
for disk in disk{1..8}; do
    sudo rm -rf "/mnt/$disk/Movies" "/mnt/$disk/TV" "/mnt/$disk/Anime" "/mnt/$disk/Roms" 2>/dev/null || true
done
echo "All disks cleaned\!" | tee -a "$PLAN_LOG"

# Simple functions to create content
create_movie() {
    local disk="$1" name="$2" year="$3" size_mb="$4"
    local dir="/mnt/${disk}/Movies/${name} (${year})"
    sudo mkdir -p "$dir"
    sudo dd if=/dev/zero of="$dir/${name} - 1080p.mkv" bs=1M count="$size_mb" 2>/dev/null
}

create_tv_episode() {
    local disk="$1" show="$2" year="$3" season="$4" episode="$5" size_mb="$6"
    local dir="/mnt/${disk}/TV/${show} (${year})/Season ${season}"
    sudo mkdir -p "$dir"
    local s=$(printf "%02d" "$season")
    local e=$(printf "%02d" "$episode")
    sudo dd if=/dev/zero of="$dir/${show} - S${s}E${e}.mkv" bs=1M count="$size_mb" 2>/dev/null
}

create_anime_episode() {
    local disk="$1" show="$2" year="$3" season="$4" episode="$5" size_mb="$6"
    local dir="/mnt/${disk}/Anime/${show} (${year})/Season ${season}"
    sudo mkdir -p "$dir"
    local s=$(printf "%02d" "$season")
    local e=$(printf "%02d" "$episode")
    sudo dd if=/dev/zero of="$dir/${show} - S${s}E${e}.mkv" bs=1M count="$size_mb" 2>/dev/null
}

create_rom() {
    local disk="$1" rom_idx="$2"
    local dir="/mnt/${disk}/Roms"
    sudo mkdir -p "$dir"

    # Random size between 5 bytes and 1MB
    # 40% very tiny (5-1000 bytes)
    # 30% tiny (1KB-10KB)
    # 20% small (10KB-100KB)
    # 10% medium (100KB-1MB)
    local rand=$((RANDOM % 100))
    if [ $rand -lt 40 ]; then
        local size_bytes=$((5 + RANDOM % 995))  # 5-1000 bytes
        sudo dd if=/dev/zero of="$dir/rom${rom_idx}.bin" bs=1 count="$size_bytes" 2>/dev/null
    elif [ $rand -lt 70 ]; then
        local size_kb=$((1 + RANDOM % 9))  # 1-10KB
        sudo dd if=/dev/zero of="$dir/rom${rom_idx}.bin" bs=1K count="$size_kb" 2>/dev/null
    elif [ $rand -lt 90 ]; then
        local size_kb=$((10 + RANDOM % 90))  # 10-100KB
        sudo dd if=/dev/zero of="$dir/rom${rom_idx}.bin" bs=1K count="$size_kb" 2>/dev/null
    else
        local size_kb=$((100 + RANDOM % 924))  # 100KB-1MB
        sudo dd if=/dev/zero of="$dir/rom${rom_idx}.bin" bs=1K count="$size_kb" 2>/dev/null
    fi
}

# Get current free space in MB
get_free_mb() {
    local disk="$1"
    local free_space
    free_space=$(df -BM "/mnt/$disk" | awk 'NR==2 {print $4}' | sed 's/M//')

    if [ -z "$free_space" ] || ! [[ "$free_space" =~ ^[0-9]+$ ]]; then
        echo "ERROR: Failed to get free space for $disk" >&2
        return 1
    fi

    echo "$free_space"
}

# Fill disk until it has target free space remaining
fill_disk() {
    local disk="$1"
    local target_free_mb="$2"
    local disk_num="${disk#disk}"
    local safety_margin=20

    echo "" | tee -a "$PLAN_LOG"
    echo "Filling $disk to ${target_free_mb}MB free..." | tee -a "$PLAN_LOG"

    local movie_idx=1
    local tv_idx=1
    local anime_idx=1
    local current_free=$(get_free_mb "$disk")
    local effective_target=$((target_free_mb + safety_margin))
    local max_iterations=1000
    local iteration=0

    while [ $current_free -gt $effective_target ] && [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))

        local space_to_fill=$((current_free - effective_target))

        if [ $space_to_fill -le 0 ]; then
            break
        fi

        # Rotate between movies, TV, and anime with VARIED sizes
        case $((($movie_idx + $tv_idx + $anime_idx) % 3)) in
            0)
                # Create movies with small sizes (1-20MB)
                local max_movie_size=$((space_to_fill > 20 ? 20 : space_to_fill))
                if [ $max_movie_size -lt 1 ]; then
                    break
                fi

                local size=$((1 + RANDOM % max_movie_size))

                local year=$((2000 + RANDOM % 24))
                create_movie "$disk" "Movie${disk_num}-${movie_idx}" "$year" "$size" || true
                movie_idx=$((movie_idx + 1))
                ;;
            1)
                local ep_size=$((1 + RANDOM % 4))
                local num_eps=$((3 + RANDOM % 8))
                local year=$((2005 + RANDOM % 20))
                for ep in $(seq 1 $num_eps); do
                    current_free=$(get_free_mb "$disk")
                    if [ $current_free -le $effective_target ]; then
                        break
                    fi
                    create_tv_episode "$disk" "TVShow${disk_num}-${tv_idx}" "$year" 1 "$ep" "$ep_size" || true
                done
                tv_idx=$((tv_idx + 1))
                ;;
            2)
                local ep_size=$((1 + RANDOM % 3))
                local num_eps=$((5 + RANDOM % 15))
                local year=$((2010 + RANDOM % 15))
                for ep in $(seq 1 $num_eps); do
                    current_free=$(get_free_mb "$disk")
                    if [ $current_free -le $effective_target ]; then
                        break
                    fi
                    create_anime_episode "$disk" "Anime${disk_num}-${anime_idx}" "$year" 1 "$ep" "$ep_size" || true
                done
                anime_idx=$((anime_idx + 1))
                ;;
        esac

        current_free=$(get_free_mb "$disk")
        echo "  $disk: ${current_free}MB free (target: ${target_free_mb}MB)" | tee -a "$PLAN_LOG"
    done

    # Add small roms - always add at least 50, then fill to target
    echo "  $disk: Adding roms..." | tee -a "$PLAN_LOG"
    local rom_idx=1
    current_free=$(get_free_mb "$disk")
    iteration=0
    local min_roms=50

    # First add minimum number of roms
    while [ $rom_idx -le $min_roms ] && [ $iteration -lt 100 ]; do
        iteration=$((iteration + 1))
        create_rom "$disk" "$rom_idx" || true
        rom_idx=$((rom_idx + 1))
    done

    # Then continue adding until we hit target
    iteration=0
    current_free=$(get_free_mb "$disk")
    while [ $current_free -gt $effective_target ] && [ $iteration -lt 400 ]; do
        iteration=$((iteration + 1))
        create_rom "$disk" "$rom_idx" || true
        rom_idx=$((rom_idx + 1))

        if [ $((rom_idx % 10)) -eq 0 ]; then
            current_free=$(get_free_mb "$disk")
        fi
    done

    current_free=$(get_free_mb "$disk")
    local actual_roms=$((rom_idx - 1))
    echo "  $disk: COMPLETE at ${current_free}MB free with ${actual_roms} roms" | tee -a "$PLAN_LOG"
}

# Fill disk8 (source) with SMALLER files than destination disks
fill_disk_small() {
    local disk="$1"
    local target_free_mb="$2"
    local disk_num="${disk#disk}"
    local safety_margin=20

    echo "" | tee -a "$PLAN_LOG"
    echo "Filling $disk with SMALL files to ${target_free_mb}MB free..." | tee -a "$PLAN_LOG"

    local movie_idx=1
    local tv_idx=1
    local anime_idx=1
    local current_free=$(get_free_mb "$disk")
    local max_iterations=1000
    local iteration=0

    # First fill with small movies/TV/anime (leave ~50MB for roms)
    local rom_reserve=50
    local target_before_roms=$((target_free_mb + rom_reserve + safety_margin))

    while [ $current_free -gt $target_before_roms ] && [ $iteration -lt $max_iterations ]; do
        iteration=$((iteration + 1))
        case $((($movie_idx + $tv_idx + $anime_idx) % 3)) in
            0)
                # Small movies: 1-10MB
                local size=$((1 + RANDOM % 9))
                local year=$((2000 + RANDOM % 24))
                create_movie "$disk" "Movie${disk_num}-${movie_idx}" "$year" "$size" || true
                movie_idx=$((movie_idx + 1))
                ;;
            1)
                # Small TV episodes: 1-3MB each
                local ep_size=$((1 + RANDOM % 2))
                local num_eps=$((3 + RANDOM % 8))
                local year=$((2005 + RANDOM % 20))
                for ep in $(seq 1 $num_eps); do
                    current_free=$(get_free_mb "$disk")
                    if [ $current_free -le $target_before_roms ]; then
                        break
                    fi
                    create_tv_episode "$disk" "TVShow${disk_num}-${tv_idx}" "$year" 1 "$ep" "$ep_size" || true
                done
                tv_idx=$((tv_idx + 1))
                ;;
            2)
                # Small anime episodes: 1-2MB each
                local ep_size=$((1 + RANDOM % 1))
                local num_eps=$((5 + RANDOM % 15))
                local year=$((2010 + RANDOM % 15))
                for ep in $(seq 1 $num_eps); do
                    current_free=$(get_free_mb "$disk")
                    if [ $current_free -le $target_before_roms ]; then
                        break
                    fi
                    create_anime_episode "$disk" "Anime${disk_num}-${anime_idx}" "$year" 1 "$ep" "$ep_size" || true
                done
                anime_idx=$((anime_idx + 1))
                ;;
        esac

        current_free=$(get_free_mb "$disk")
        echo "  $disk: ${current_free}MB free (target before roms: ${target_before_roms}MB)" | tee -a "$PLAN_LOG"
    done

    # Now fill remaining space with tiny rom files
    echo "  $disk: Adding roms to fill to ${target_free_mb}MB..." | tee -a "$PLAN_LOG"
    local rom_idx=1
    current_free=$(get_free_mb "$disk")
    local effective_target=$((target_free_mb + safety_margin))
    iteration=0

    while [ $current_free -gt $effective_target ] && [ $iteration -lt 500 ]; do
        iteration=$((iteration + 1))
        create_rom "$disk" "$rom_idx" || true
        rom_idx=$((rom_idx + 1))

        # Check every 10 roms to avoid too many df calls
        if [ $((rom_idx % 10)) -eq 0 ]; then
            current_free=$(get_free_mb "$disk")
            echo "  $disk: ${current_free}MB free, ${rom_idx} roms created" | tee -a "$PLAN_LOG"
        fi
    done

    current_free=$(get_free_mb "$disk")
    echo "  $disk: COMPLETE at ${current_free}MB free with ${rom_idx} rom files" | tee -a "$PLAN_LOG"
}

# Fill destination disks (disk1-7) with VARIED free space for bin-packing testing
echo "" | tee -a "$PLAN_LOG"
echo "Creating destination disks with varied free space..." | tee -a "$PLAN_LOG"

# Create disks with very different amounts of free space to test bin-packing
fill_disk "disk1" $((180 + RANDOM % 40))   # 180-220MB
fill_disk "disk2" $((140 + RANDOM % 40))   # 140-180MB
fill_disk "disk3" $((100 + RANDOM % 30))   # 100-130MB
fill_disk "disk4" $((60 + RANDOM % 30))    # 60-90MB
fill_disk "disk5" $((30 + RANDOM % 20))    # 30-50MB
fill_disk "disk6" $((15 + RANDOM % 10))    # 15-25MB
fill_disk "disk7" $((5 + RANDOM % 5))      # 5-10MB

# Fill source disk (disk8) with SMALL files + tiny roms
# Leaving MORE free space than any destination
echo "" | tee -a "$PLAN_LOG"
echo "Creating source disk with SMALL files (250-280MB free - MOST free)..." | tee -a "$PLAN_LOG"
target_free=$((250 + RANDOM % 30))  # 250-280MB free (more than disk1's max of 220MB)
fill_disk_small "disk8" "$target_free"

# Show final disk usage
echo "" | tee -a "$PLAN_LOG"
echo "========================================" | tee -a "$PLAN_LOG"
echo "Final disk usage:" | tee -a "$PLAN_LOG"
for disk in disk{1..8}; do
    df -h "/mnt/$disk" | grep -v Filesystem | tee -a "$PLAN_LOG"
done

echo "" | tee -a "$PLAN_LOG"
echo "Complete\! Test data ready." | tee -a "$PLAN_LOG"
echo "Logs: $LOG_DIR" | tee -a "$PLAN_LOG"
