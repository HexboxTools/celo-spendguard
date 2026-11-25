#!/usr/bin/env node
// Owner kill switch: revoke the agent's session key in one transaction.
import fs from "node:fs";
import { createClient, signerFromPrivateKey, deserializeSession } from "@altananetwork/sdk";
import { network } from "../src/config.mjs";
import { altanaNetwork } from "../src/payers/altana.mjs";
import { readKey } from "../src/agent.mjs";
const net = network();
const client = createClient({ chains: [altanaNetwork(net.name)] });
const admin = signerFromPrivateKey(readKey(process.env.ADMIN_KEY_FILE));
const wallet = await client.createWallet({ signer: admin });
const session = deserializeSession(JSON.parse(fs.readFileSync(`session.${net.name}.json`, "utf8")), signerFromPrivateKey(readKey(process.env.SESSION_KEY_FILE)));
const r = await client.revokeSession({ wallet, signer: admin, session });
console.log(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
