import fs     from 'fs/promises';
import {exec} from 'child_process';
import {pid}  from 'process';

const recursive  = {recursive: true};
const nothing    = () => null;
const something  = () => true;
const throwError = e => {
	throw e;
};

export default class {
    constructor(root)        {
        this.root     = root + (root.endsWith('/') ? '' : '/');
        this.opened   = this.makepath(this.root);   
    }

   	async check(file)        {
		const files    = (await fs.readdir(file.dir).catch(() => [])).filter(entry => entry.includes('.pid'));
        const pidfile  = file.path + '.pid.' + pid;

		if (!files.length) {
			await this.makepath(file.dir);
			await fs.writeFile(pidfile, '');

			return false;
		}

        for (let subject of files) {
            if (await this.exists(`/proc/${subject.split('.').pop()}/`)) {
                return true;
            }

            void fs.unlink(file.dir + '/' + subject).catch(nothing);
        }

        await fs.writeFile(pidfile, '');

        return false;
	}
    async del(key)           {
        return await fs.unlink(this.locate(key).path).catch(nothing);
    }
    async each(method)       {
        for await (const dir of await fs.readdir(this.root)) {
            for await (const file of await fs.readdir(this.root + dir)) {                
                await method({
                    content : await this.read(this.root + dir + '/' + file), 
                    file    : file, 
                    dir     : this.root + dir
                });
            }
        }
    }
    async exists(path)       {
        return !Boolean(await fs.access(path).catch(something));
    }
    async has(key, path)     {
        return await this.exists(path || this.locate(key).path);
    }
    async link(key, ref)     {
        const reference = this.locate(ref);
        const file      = this.locate(key);
		const haslink   = await Promise.all([
    		this.has(null, file.path),
    		this.has(null, reference.path)
    	]);

    	if (!haslink[1] || (haslink[0] && haslink[1])) {
    		return null;
    	}

        await this.makepath(file.dir);
        await fs.link(reference.path, file.path).catch(throwError);
        
        return true;
    }
    async get(key)           {
        return await this.read(this.locate(key).path).catch(nothing);
    }
    async merge(key, data)   {
        const current = await this.get(key);

        if (data instanceof Object && current instanceof Object) {
            if (!Array.isArray(current)) {
                return this.objectmerge(current, data);
            }
            if (Array.isArray(data)) {
                return Array.from(new Set(current.concat(data)));
            }
        }

        return data;
    }
    async set(key, value)    {
    	const file = this.locate(key);

    	await this.writable(file).catch(nothing);
    	await this.write(file, value);

    	return true;
    }
    async update(key, data)  {
    	if (!await this.has(key)) {
    		return this.set(key, data);
    	}

    	const file = this.locate(key);

    	await this.writable(file).catch(nothing);
        await this.overwrite(file, await this.merge(key, data));

        return;
    }
    async read(file)         {
        const fd = await fs.open(file, 'r').catch(nothing);

        if (!fd) return null;

        const size = (await fd.stat()).size;
        const buff = Buffer.alloc(size);
        const data = await fd.read(buff, 0, size, 0).catch(nothing);

        void fd.close();

        return JSON.parse(data.buffer);
    }
    async write(file, data)  {
        await fs.writeFile(file.path, JSON.stringify(data)).catch(throwError);
        await fs.unlink(file.path + '.pid.' + pid).catch(nothing);

        return true;
    }
	async writable(file)     {
		while (await this.check(file)) {
    		await new Promise(resolve => setTimeout(resolve, 50));
    	}

    	return;
	}
	
	clear()                      {
		return new Promise(resolve => {
			void exec(`rm -rf ${this.root} && mkdir -p ${this.root}`, resolve);
		});
	}
	hash(data)                   {
        return Buffer
        	.from(String(data))
        	.toString('hex');
    }
    locate(key)                  {
    	const uid  = this.hash(key);
    	const dir  = uid.slice(0, 3);
    	const name = uid.slice(3);
    	
    	return {
    		path: this.root + dir + '/' + name,
    		name: name,
    		dir : this.root + dir,
    	};
    }
    makepath(dir, remove)        {
        return fs.mkdir(dir, recursive)
                 .catch(nothing);
    }    
    objectmerge(source, target)  {
        return void Object.keys(target).forEach(key => {
            source[key] instanceof Object && target[key] instanceof Object
                ? source[key] instanceof Array && target[key] instanceof Array
                    ? void (source[key] = Array.from(new Set(source[key].concat(target[key]))))
                    : !(source[key] instanceof Array) && !(target[key] instanceof Array)
                        ? void this.objectmerge(source[key], target[key])
                        : void (source[key] = target[key])
                : void (source[key] = target[key]);
        }) || source;
    }
    overwrite(file, data)        {
    	return new Promise(resolve => {
    		void this.makepath(file.dir)
    			.then(() => fs.copyFile(file.path, file.path + '.tmp')
    				.then(() => this.write(file, data)
    					.then(() => fs.unlink(file.path + '.tmp')
    						.finally(resolve))
    					.catch(throwError))
    				.catch(throwError))
    			.catch(throwError);
    	});
    }
}
