import * as core from "@actions/core";
import axios from 'axios';
import { inspect } from "util";
import { v4 as uuidv4 } from 'uuid';
import { setTimeout } from "timers/promises";

type ActionArguments = {
    email: string,
    password: string,
    instanceName: string,
    timeout: number
}

type LoginResponse = {
    token: string
}

type AuthCheckResponse = {
    name: string,
    slug: string
}

type InstanceResponse = {
    id: number,
    name: string,
    status: string,
    external_ip: string,
    backup: {
        unique_name: string,
        version: {
            package: {
                config: {
                    sap_system_id: string,
                    sap_system_no: string
                }
            }
        }
    }
}

const AXIOS_INTERNAL_ID_KEY = 'INTERNAL_ID';

const _buildAxios = () => {
    axios.interceptors.request.use((request) => {
        const internalId = uuidv4();
        request[AXIOS_INTERNAL_ID_KEY] = internalId;
        var sRequest = `${request.method} ${request.baseURL}${request.url}`;
        if (request.params) {
            sRequest += `, parameters: ${inspect(request.params, { breakLength: Infinity, compact: true })}`;
        }
        if (request.data && !request.url.includes('login')) {
            sRequest += `, data: ${inspect(request.data, { breakLength: Infinity, compact: true })}`;
        }
        core.debug(`Starting AXIOS request ${internalId}: ${sRequest}`);
        return request;
    }, (error) => {
        core.debug(`AXIOS request error: ${error}`);
        return Promise.reject(error);
    });
    axios.interceptors.response.use((response) => {
        const internalId = response.request && response.request[AXIOS_INTERNAL_ID_KEY] ? response.request[AXIOS_INTERNAL_ID_KEY] : 'Unknown';
        if(response.data && response.data.token){
            //MIW: secret in response, avoid leak
            core.setSecret(response.data.token);
        }
        var sResponse = `status: ${response.status}, status text: ${response.statusText}`;
        if (response.data) {
            sResponse += `, data: ${inspect(response.data, { breakLength: Infinity, compact: true })}`;
        }
        core.debug(`Ending AXIOS request ${internalId}: ${sResponse}`);
        return response;
    }, (error) => {
        core.debug(`AXIOS response error: ${error}`);
        return Promise.reject(error);
    });
    axios.defaults.baseURL = `https://app.nuveplatform.com/api`;
}

const _main = async (args: ActionArguments): Promise<void> => {
    _buildAxios();
    const authResponse = await axios.post<LoginResponse>(`/auth/login`, {
        email: args.email,
        password: args.password
    });
    try {
        const aCookie = authResponse.headers[`set-cookie`];
        axios.defaults.headers.common[`Cookie`] = aCookie[0];
    } catch (e) {
        throw new Error(`Couldn't set Cookie header: authorization failed.`);
    }
    const authCheck = await axios.get<AuthCheckResponse>(`/auth/check`);
    console.log(`Logged in as ${authCheck.data.name}.`);
    var instances = await axios.get<InstanceResponse[]>(`/organizations/${authCheck.data.slug}/instances`);
    const oInstance = instances.data.find(o => o.name === args.instanceName);
    if(!oInstance){
        throw new Error(`Instance not found.`);
    }
    await axios.delete<InstanceResponse[]>(`/organizations/${authCheck.data.slug}/instances/${oInstance.id}`);
    const timeoutDate = new Date((new Date()).getTime() + (args.timeout * 1000));
    core.debug(`Timeout date: ${timeoutDate.toString()}`);
    while(instances.data.find(o => o.id === oInstance.id)){
        console.log(`Waiting for instance to shutdown...`);
        await setTimeout(60000);
        if((new Date()).getTime() < timeoutDate.getTime()){
            instances = await axios.get<InstanceResponse[]>(`/organizations/${authCheck.data.slug}/instances`);
        }else{
            throw new Error(`Waiting for instance shutdown timed out after ${args.timeout} seconds.`);
        }
    }
}

var timeout: number;
try{
    timeout = parseInt(core.getInput('timeout'));
}catch(e){
    core.error('Invalid timeout input value');
}

_main({
    email: core.getInput('email'),
    password: core.getInput('password'),
    instanceName: core.getInput('instanceName'),
    timeout
}).then(() => {
    console.log(`Instance shutdown success.`);
}).catch(e => {
    var sError: string;
    try {
        sError = e.response.data.detail.message;
    } catch (er) {
        sError = e.toString();
    }
    core.error(sError);
});