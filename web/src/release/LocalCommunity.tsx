import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { communityLink } from "./workspaceLink";
import type { Settings } from "../generated/Settings";

/** The local account entry; provider cookies remain on the configured service origin. */
export function LocalCommunity() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [address, setAddress] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api.settings().then(
      (value) => {
        setSettings(value);
        setAddress(value.community_url ?? "");
      },
      () => setNotice("Could not load your community connection."),
    );
  }, []);
  const savedAddress = settings?.community_url;
  return (
    <section className="release-page community-account">
      <h1>Community</h1>
      <p>Your account, saved blocks, and publications. New to composing agents? <Link to="/community/learn">Learn how to design a team</Link>.</p>
      <div className="release-card">
        {savedAddress ? (
          <>
            <h2>Your community account</h2>
            <a
              className="btn btn-primary"
              href={communityLink(savedAddress, "")}
            >
              Open your account →
            </a>
            <a className="btn" href={communityLink(savedAddress, "/explore")}>Browse blocks</a>
            <a className="btn" href={communityLink(savedAddress, "/saved")}>Saved blocks</a>
            <p>Sign in to manage your profile and shared blocks.</p>
          </>
        ) : (
          <>
            <h2>Connect your account</h2>
            <p>
              Enter your community service address to sign in. This workspace
              continues to run locally.
            </p>
          </>
        )}
        <details open={!savedAddress}>
          <summary>Community connection</summary>
          <form
            className="release-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!settings) return;
              try {
                const next = {
                  ...settings,
                  community_url: address.trim() || undefined,
                };
                await api.saveSettings(next);
                setSettings(next);
                setNotice("Community connection saved.");
              } catch {
                setNotice(
                  "Could not save. Use an HTTPS service address, or localhost for development.",
                );
              }
            }}
          >
            <label>
              Service address
              <input
                type="url"
                placeholder="https://community.example.com"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <button className="btn" disabled={!settings}>
              Save connection
            </button>
          </form>
        </details>
      </div>
      <p>
        Your <Link to="/library/groups">private Library</Link> stays on this
        machine. Export and review a group before publishing; choose Add to project on any saved or browsed block to open it here.
      </p>
      <p role="status">{notice}</p>
    </section>
  );
}
