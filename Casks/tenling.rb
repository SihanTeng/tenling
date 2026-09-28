# Homebrew cask for TenLing. This file is the canonical template; the Release
# workflow renders it (version + sha256) into the SihanTeng/homebrew-tenling tap
# on every release via scripts/update-homebrew-cask.sh.
cask "tenling" do
  version "0.3.3"
  sha256 "b6e65f88d8f91b3b9d5c44fbfb879436f917ddc6062cf5ff7a66e1ff1ab5c3af"

  url "https://github.com/SihanTeng/tenling/releases/download/v#{version}/tenling-#{version}-macos-universal.dmg"
  name "TenLing"
  desc "Calm, cross-platform Markdown viewer and editor"
  homepage "https://github.com/SihanTeng/tenling"

  livecheck do
    url :url
    regex(/^v?(\d+(?:\.\d+)+)$/i)
    strategy :github_releases do |releases, regex|
      releases.filter_map do |release|
        next if release["draft"] || release["prerelease"]
        next unless release["assets"]&.any? { |asset| asset["name"].end_with?("-macos-universal.dmg") }

        release["tag_name"]&.[](regex, 1)
      end
    end
  end

  depends_on macos: ">= :catalina"

  app "TenLing.app"

  zap trash: [
    "~/Library/Application Support/com.tenling.app",
    "~/Library/Caches/com.tenling.app",
    "~/Library/WebKit/com.tenling.app",
  ]
end
