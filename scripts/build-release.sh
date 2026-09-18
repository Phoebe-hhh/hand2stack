#!/usr/bin/env bash
set -euo pipefail

tag="${1:-}"
commit="${2:-HEAD}"
output_dir="${3:-dist}"

if [[ ! "$tag" =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Usage: $0 vX.Y.Z[-suffix] [commit] [output-directory]" >&2
  exit 2
fi

if ! version_contents="$(git show "${commit}:stackinputhelper/version.php")"; then
  echo "Could not read stackinputhelper/version.php from ${commit}." >&2
  exit 1
fi
plugin_release="$(printf '%s\n' "$version_contents" | awk -F"'" '/\$plugin->release/{print $2; exit}')"
if [[ -z "$plugin_release" ]]; then
  echo "Could not read the plugin release from stackinputhelper/version.php." >&2
  exit 1
fi
if [[ "$tag" != "v${plugin_release}" ]]; then
  echo "Tag ${tag} does not match plugin release ${plugin_release}." >&2
  exit 1
fi

mkdir -p "$output_dir"
zip_path="${output_dir}/stackinputhelper-${tag}.zip"
changelog_path="${output_dir}/CHANGELOG-${tag}.md"

git archive \
  --format=zip \
  --prefix=stackinputhelper/ \
  --output="$zip_path" \
  "${commit}:stackinputhelper"

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
