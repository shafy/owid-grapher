#! /usr/bin/env jest

import { GitCmsClient } from "./GitCmsClient.js"
import { GitCmsServer } from "./GitCmsServer.js"
import { removeSync } from "fs-extra"
import express from "express"
import * as bodyParser from "body-parser"
import * as nodeFetch from "node-fetch"

jest.setTimeout(10000) // wait for up to 10s for the server to respond

describe("client/server integration tests", () => {
    const baseDir = __dirname + "/integrationTestTempDirectoryOkToDelete"

    // Arrange
    const testPort = 3456
    const expressApp = express()
    expressApp.use(bodyParser.json())

    const server = new GitCmsServer({ baseDir })
    server.verbose = false
    server.addToRouter(expressApp)
    const expressServer = expressApp.listen(testPort)

    beforeAll(async () => {
        // todo: whats a better pattern?
        const glob = global as any
        glob.fetch = nodeFetch

        await server.createDirAndInitIfNeeded()
    })

    afterAll(() => {
        const glob = global as any
        glob.fetch = undefined
        expressServer.close()
        removeSync(baseDir)
    })

    const client = new GitCmsClient(`http://localhost:${testPort}`)
    const filepath = "foo.txt"
    const content = "bar"
    expect(server).toBeTruthy()

    it("can write a file", async () => {
        const response = await client.writeRemoteFile({
            filepath,
            content,
            commitMessage: "created file",
        })

        expect(response.success).toBeTruthy()
    })

    it("fails write gracefully when given a bad path", async () => {
        const response = await client.writeRemoteFile({
            filepath: "../badpath",
            content,
            commitMessage: "test writing a bad path",
        })
        expect(response.success).toBeFalsy()
    })

    it("can read a file", async () => {
        const response = await client.readRemoteFile({ filepath })
        expect(response.success).toBeTruthy()
        expect(response.content).toEqual(content)
    })

    it("can read multiple files", async () => {
        const response = await client.readRemoteFiles({
            glob: "*.txt",
            folder: "",
        })
        expect(response.success).toBeTruthy()
        expect(response.files.length).toEqual(1)
        expect(response.files[0].content).toEqual(content)
    })

    it("can fail reading gracefully", async () => {
        const response = await client.readRemoteFile({
            filepath: "fail.txt",
        })
        expect(response.success).toBeFalsy()
    })

    it("can delete a file", async () => {
        const response = await client.deleteRemoteFile({ filepath })

        expect(response.success).toBeTruthy()
    })

    it("can fail delete gracefully", async () => {
        const response = await client.deleteRemoteFile({
            filepath,
        })
        expect(response.success).toBeFalsy()
    })
})
