import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
    CompositeTemplateRegistry,
    DatabaseTemplateRegistry,
    FileTemplateRegistry,
    type TemplateDefinition,
} from "../index";

const template: TemplateDefinition = {
    templateKey: "TXNX-001",
    eventType: "TXNX-001",
    channel: "SMS",
    language: "en",
    version: 2,
    content: "{{stockName}} buy order executed",
};

describe("template registries", () => {
    const directories: string[] = [];

    afterEach(async () => {
        await Promise.all(directories.map((directory) =>
            rm(directory, { recursive: true, force: true }),
        ));
        directories.length = 0;
    });

    it("loads a template from the filesystem", async () => {
        const directory = await mkdtemp(join(tmpdir(), "zetheta-templates-"));
        directories.push(directory);
        await writeFile(
            join(directory, "TXNX-001.sms.en.json"),
            JSON.stringify(template),
        );

        const registry = new FileTemplateRegistry(directory);

        await expect(registry.find({
            templateKey: "TXNX-001",
            channel: "SMS",
            language: "en",
        })).resolves.toEqual(template);
    });

    it("loads the latest active database template", async () => {
        const findFirst = async () => template;
        const registry = new DatabaseTemplateRegistry({
            template: { findFirst },
        });

        await expect(registry.find({
            templateKey: "TXNX-001",
            channel: "SMS",
            language: "en",
        })).resolves.toEqual(template);
    });

    it("uses the first registry that has a matching template", async () => {
        const registry = new CompositeTemplateRegistry([
            { find: async () => null },
            { find: async () => template },
        ]);

        await expect(registry.find({
            templateKey: "TXNX-001",
            channel: "SMS",
            language: "en",
        })).resolves.toEqual(template);
    });
});
