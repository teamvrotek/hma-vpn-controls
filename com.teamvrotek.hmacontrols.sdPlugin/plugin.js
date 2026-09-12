import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { createBridge, openHma } from "./bridge.js";
import { registerControl } from "./controller.js";

registerControl(streamDeck, SingletonAction, createBridge(), openHma);
await streamDeck.connect();
