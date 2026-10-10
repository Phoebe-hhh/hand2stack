#!/usr/bin/env bash
set -euo pipefail

tag="${1:-}"
commit="${2:-HEAD}"
output_dir="${3:-dist}"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 vX.Y.Z[-suffix] [commit] [output-directory]" >&2
  exit 2
fi

if ! version_contents="$(git show "${commit}:hand2stack/version.php")"; then
  echo "Could not read hand2stack/version.php from ${commit}." >&2
  exit 1
fi
plugin_release="$(printf '%s\n' "$version_contents" | awk -F"'" '/\$plugin->release/{print $2; exit}')"
if [[ -z "$plugin_release" ]]; then
  echo "Could not read the plugin release from hand2stack/version.php." >&2
  exit 1
fi
if [[ "$tag" != "v${plugin_release}" ]]; then
  echo "Tag ${tag} does not match plugin release ${plugin_release}." >&2
  exit 1
fi

# Moodle upgrades a plugin, and reloads its JavaScript, only when the
# version number grows. A release that keeps the previous number would
# leave sites that already installed that version on the old code.
plugin_version_of() {
  awk -F'[=;]' '/\$plugin->version/{gsub(/[[:space:]]/, "", $2); print $2; exit}'
}
plugin_version="$(printf '%s\n' "$version_contents" | plugin_version_of)"
previous_release_tag="$(git tag --list 'v*' --sort=-version:refname | awk -v current="$tag" '$0 != current {print; exit}')"
if [[ -n "$previous_release_tag" ]]; then
  previous_version="$(git show "${previous_release_tag}:hand2stack/version.php" | plugin_version_of)"
  if [[ -z "$plugin_version" || -z "$previous_version" || "$plugin_version" -le "$previous_version" ]]; then
    echo "Plugin version ${plugin_version:-?} must be greater than ${previous_version:-?} in ${previous_release_tag}." >&2
    exit 1
  fi
fi

mkdir -p "$output_dir"
zip_path="${output_dir}/hand2stack-${tag}.zip"
changelog_path="${output_dir}/CHANGELOG-${tag}.md"

git archive \
  --format=zip \
  --prefix=hand2stack/ \
  --output="$zip_path" \
  "${commit}:hand2stack"

previous_tag="$(git tag --list 'v*' --sort=-version:refname | awk -v current="$tag" '$0 != current {print; exit}')"
{
  echo "# Hand2STACK ${tag}"
  echo
  echo "Generated from commit \`${commit}\`."
  echo
  if [[ -n "$previous_tag" ]]; then
    echo "## Changes since ${previous_tag}"
    echo
    git log --format='- %s (%h)' "${previous_tag}..${commit}"
    echo
    echo "**Full changelog:** ${previous_tag}...${tag}"
  else
    echo "## Changes"
    echo
    git log --format='- %s (%h)' "$commit"
  fi
} > "$changelog_path"

echo "Created ${zip_path}"
echo "Created ${changelog_path}"
