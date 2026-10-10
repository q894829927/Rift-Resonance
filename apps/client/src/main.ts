import Phaser from "phaser";
import { PROTOCOL_VERSION } from "@rift/shared";
import "./style.css";

class BootstrapScene extends Phaser.Scene {
  constructor() {
    super("BootstrapScene");
  }

  create(): void {
    this.cameras.main.setBackgroundColor("#101522");

    this.add.text(480, 190, "RIFT RESONANCE", {
      fontFamily: "Arial, sans-serif",
      fontSize: "40px",
      fontStyle: "bold",
      color: "#d9ebff"
    }).setOrigin(0.5);

    this.add.text(480, 266, "异界共振  ·  M0-A 工程骨架", {
      fontFamily: "Arial, sans-serif",
      fontSize: "22px",
      color: "#a6b4ce"
    }).setOrigin(0.5);

    this.add.text(480, 318, `Protocol v${PROTOCOL_VERSION} · 暂未加入游戏房间`, {
      fontFamily: "Arial, sans-serif",
      fontSize: "16px",
      color: "#6dd9c1"
    }).setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "app",
  width: 960,
  height: 540,
  scene: [BootstrapScene]
});
